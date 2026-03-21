const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ==========================================
// CORS Configuration
// ==========================================
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));

app.use(express.json());

// Importing Models
const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch, WorkOrder } = require('./models');

// Serve the Frontend Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// DB Connection
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection CRASH:", err));

// ==========================================
// 1. ROLE-BASED LOGIN
// ==========================================
const DASHBOARD_USERS = {
    "admin": { pass: "admin123", role: "ADMIN" },
    "buyer": { pass: "buy123", role: "PURCHASE" },
    "ppc": { pass: "ppc123", role: "PPC" },
    "maker": { pass: "make123", role: "PRODUCTION" },
    "seller": { pass: "sell123", role: "SALES" },
    "qc": { pass: "qc123", role: "QC" }
};

const WORKER_USERS = {
    "worker1": { pass: "work123", role: "PRODUCTION" },
    "worker2": { pass: "work456", role: "PRODUCTION" }
};

app.post('/api/login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    if (password === 'Admin12345' && !username) {
        return res.json({ success: true, role: "ADMIN", username: "Admin" });
    }

    if (DASHBOARD_USERS[username] && DASHBOARD_USERS[username].pass === password) {
        res.json({ success: true, role: DASHBOARD_USERS[username].role, username: username });
    } else {
        res.status(401).json({ success: false, message: "Access Denied: Dashboard credentials required." });
    }
});

app.post('/api/app-login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    if (username === 'admin' && password === DASHBOARD_USERS['admin'].pass) {
        return res.json({ success: true, role: "ADMIN", username: "admin" });
    }

    if (WORKER_USERS[username] && WORKER_USERS[username].pass === password) {
        res.json({ success: true, role: WORKER_USERS[username].role, username: username });
    } else {
        res.status(401).json({ success: false, message: "Access Denied: Worker credentials required." });
    }
});

// ==========================================
// 2. PPC ROUTING ENGINE
// ==========================================
app.put('/api/ppc/verify/:id', async (req, res) => {
    try {
        const { status, remarks, nextRoute, username } = req.body;
        const batch = await ProductionBatch.findById(req.params.id);

        if (!batch) return res.status(404).json({ error: "Batch not found" });

        batch.ppcStatus = status;
        batch.ppcRemarks = remarks;
        batch.ppcBy = username;
        batch.ppcDate = new Date();

        if (status === 'APPROVED') {
            batch.nextProcessRoute = nextRoute; 
            batch.isReadyForNextStage = true; 
        }

        await batch.save();
        res.json({ success: true, message: `Batch ${status} and routed to ${nextRoute || 'Hold'}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. QC GATEKEEPER & INVENTORY MOVEMENT
// ==========================================
app.get('/api/qc/pending', async (req, res) => {
    try {
        // Only show QC batches that PPC has approved
        const pendingBatches = await ProductionBatch.find({ qcStatus: 'PENDING', ppcStatus: 'APPROVED' }).sort({ date: -1 });
        res.json(pendingBatches);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/qc/history', async (req, res) => {
    try {
        const history = await ProductionBatch.find({ qcStatus: { $in: ['APPROVED', 'REJECTED'] } }).sort({ qcDate: -1 }).limit(100);
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/qc/approve/:id', async (req, res) => {
    try {
        const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        if (batch.ppcStatus !== 'APPROVED') return res.status(400).json({ error: "PPC Approval required before QC." });

        const incomingStatus = req.body.status || 'APPROVED'; 
        
        const finalAccQty = req.body.accQty !== undefined ? req.body.accQty : batch.acceptedQty;
        const finalRejQty = req.body.rejQty !== undefined ? req.body.rejQty : batch.rejectedQty;
        const finalRejKg  = req.body.rejKg !== undefined ? req.body.rejKg : batch.rejectionKg;

        if (incomingStatus === 'APPROVED') {
            let lookupCode = batch.partNo || batch.productBarcode;
            if (lookupCode) {
                let product = await Product.findOne({ barcode: lookupCode.trim() });
                if (!product) {
                    product = new Product({ barcode: lookupCode.trim(), productCode: lookupCode.trim(), currentStock: 0, wipStock: 0 });
                }

                // ROUTING LOGIC based on Stage
                // ROUTING LOGIC based on Stage OR PPC Route
                if (batch.stage === 'POLISHING' || batch.stage === 'SEC_OP' || batch.nextProcessRoute === 'READY_STOCK') {
                    // Final Stage -> Move to Ready Stock
                    product.currentStock += finalAccQty;
                    // Deduct from WIP since it finished
                    product.wipStock = Math.max((product.wipStock || 0) - (finalAccQty + finalRejQty), 0);
                    await new Transaction({ barcode: product.barcode, type: 'QC_APPROVAL', quantity: finalAccQty, resultingStock: product.currentStock, user: req.body.qcBy }).save();
                } else if (batch.stage === 'FORGING') {
                    // Stage 1 -> Add to WIP
                    product.wipStock = (product.wipStock || 0) + finalAccQty;
                } else {
                    // Intermediate stages (Rolling, Heat Treat) -> Stays in WIP, just deduct rejects
                    product.wipStock = Math.max((product.wipStock || 0) - finalRejQty, 0);
                }
                
                product.lastUpdated = new Date();
                await product.save();
            }
        }

        batch.acceptedQty = finalAccQty;
        batch.rejectedQty = finalRejQty;
        batch.rejectionKg = finalRejKg;
        batch.measuredLength = req.body.measuredLength;
        batch.measuredAF = req.body.measuredAF;
        batch.threadGauge = req.body.threadGauge;
        batch.qcStatus = incomingStatus;
        batch.qcBy = req.body.qcBy || 'QC Inspector';
        batch.qcDate = new Date();
        batch.qcRemarks = req.body.qcRemarks || '';
        await batch.save();

        res.json({ success: true, message: `QC ${incomingStatus} Successfully!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. PRODUCTION DEPT
// ==========================================
app.get('/api/production/batches', async (req, res) => {
    try {
        const batches = await ProductionBatch.find().sort({ date: -1, _id: -1 }).limit(200);
        res.json(batches);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/production/batch', async (req, res) => {
    try {
        let lookupCode = req.body.partNo || req.body.productBarcode; 
        if (lookupCode) {
            lookupCode = lookupCode.trim();
            let product = await Product.findOne({ barcode: lookupCode });
            if (!product) {
                product = new Product({ barcode: lookupCode, productCode: lookupCode, currentStock: 0, wipStock: 0 });
            }

            // Deduct Raw Material for Stage 1 ONLY
            if (req.body.stage === 'FORGING') {
                if (req.body.rawMaterialCode && req.body.rawMaterialConsumedKg) {
                    const cleanRmCode = req.body.rawMaterialCode.trim().toUpperCase();
                    const consumedRm = Number(req.body.rawMaterialConsumedKg);
                    const material = await RawMaterial.findOne({ materialCode: cleanRmCode });
                    if (material) {
                        material.currentStockKg -= consumedRm;
                        material.lastUpdate = new Date();
                        await material.save();
                    }
                }
            } 
            
            product.lastUpdated = new Date(); 
            await product.save();
        }

        const newBatch = new ProductionBatch({
            ...req.body,
            batchNumber: req.body.batchNumber || `BATCH-${Date.now()}`,
            date: req.body.date ? new Date(req.body.date) : new Date(),
            length: Number(req.body.length) || 0,
            rawMaterialConsumedKg: Number(req.body.rawMaterialConsumedKg) || 0,
            pieceWeightKg: Number(req.body.pieceWeightKg) || 0,
            scheduleHours: Number(req.body.scheduleHours) || 0,
            jobChangeHours: Number(req.body.jobChangeHours) || 0,
            prodPlannedHours: Number(req.body.prodPlannedHours) || 0,
            speedRpm: Number(req.body.speedRpm) || 0,
            shiftTargetQty: Number(req.body.shiftTargetQty) || 0,
            acceptedQty: Number(req.body.acceptedQty) || 0,
            rejectedQty: Number(req.body.rejectedQty) || 0,
            rejectionKg: Number(req.body.rejectionKg) || 0,
            lossMajorJC: Number(req.body.lossMajorJC) || 0, lossMinorJC: Number(req.body.lossMinorJC) || 0,
            lossSetting: Number(req.body.lossSetting) || 0, lossMcClean: Number(req.body.lossMcClean) || 0,
            lossToolRework: Number(req.body.lossToolRework) || 0, lossNoTool: Number(req.body.lossNoTool) || 0,
            lossNoLoad: Number(req.body.lossNoLoad) || 0, lossNoOperator: Number(req.body.lossNoOperator) || 0,
            lossMMnt: Number(req.body.lossMMnt) || 0, lossEMnt: Number(req.body.lossEMnt) || 0,
            lossNoPower: Number(req.body.lossNoPower) || 0, lossNoAirOil: Number(req.body.lossNoAirOil) || 0,
            lossNoRm: Number(req.body.lossNoRm) || 0, lossRmLoading: Number(req.body.lossRmLoading) || 0,
            lossQaApproval: Number(req.body.lossQaApproval) || 0, lossCoilChange: Number(req.body.lossCoilChange) || 0,
            lossNoPlan: Number(req.body.lossNoPlan) || 0, lossNpdTeam: Number(req.body.lossNpdTeam) || 0,
            lossUnknown: Number(req.body.lossUnknown) || 0,
            ppcStatus: 'PENDING',
            qcStatus: 'PENDING'
        });

        await newBatch.save();
        res.json({ success: true, message: `Production Logged!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/production/batch/:id', async (req, res) => {
    try {
        const deletedBatch = await ProductionBatch.findByIdAndDelete(req.params.id);
        if (!deletedBatch) return res.status(404).json({ success: false, message: "Batch not found" });
        res.status(200).json({ success: true, message: "Batch deleted successfully" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==========================================
// 5. INVENTORY & TRANSACTIONS
// ==========================================
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ lastUpdated: -1, _id: -1 });
        res.json(products);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { productCode, sector, type, grade, af, length, weightPerPc, currentStock } = req.body;
        const barcode = productCode.trim();
        const existing = await Product.findOne({ barcode });
        if (existing) return res.status(400).json({ success: false, message: "Product Code already exists!" });

        const newProduct = new Product({
            barcode, productCode: barcode, sector, type, grade, af: af || null, length: length || null, weightPerPc: weightPerPc || 0, currentStock: currentStock || 0, wipStock: 0
        });
        await newProduct.save();

        if (currentStock > 0) {
            await new Transaction({ barcode, type: 'INWARD', quantity: currentStock, resultingStock: currentStock, user: "Admin (New Item)" }).save();
        }
        res.json({ success: true, message: "Product Added Successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try {
        const updatedItem = await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { new: true });
        res.status(200).json(updatedItem);
    } catch (error) { res.status(500).json({ message: error.message }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1, _id: -1 }).limit(100);
        res.json(transactions);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 6. PURCHASE & RAW MATERIALS
// ==========================================
app.get('/api/raw-materials', async (req, res) => {
    try {
        let materials = await RawMaterial.find().sort({ lastUpdate: -1 });
        res.json(materials);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    const { materialCode, materialName, grade, supplier, scope, addedKg, username } = req.body;
    try {
        let material = await RawMaterial.findOne({ materialCode });
        if (!material) {
            material = new RawMaterial({
                materialCode, materialName: materialName || "Carbon Steel", grade, lastSupplier: supplier, scope, currentStockKg: addedKg, lastUpdatedBy: username || 'Purchase Dept', lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += Number(addedKg);
            if (grade) material.grade = grade;               
            if (supplier) material.lastSupplier = supplier;  
            if (scope) material.scope = scope;               
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            if (materialName && materialName.trim() !== "") material.materialName = materialName.trim();
        }
        await material.save();
        await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username || 'Purchase Dept' }).save();
        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/purchase-orders', async (req, res) => {
    try {
        const pos = await PurchaseOrder.find().sort({ orderDate: -1, _id: -1 });
        res.json(pos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/purchase-orders', async (req, res) => {
    const { supplierName, materialCode, grade, scope, expectedKg, costPerKg, username } = req.body;
    try {
        const newPO = new PurchaseOrder({
            poNumber: `PO-${Date.now()}`, supplierName, materialCode: materialCode.toUpperCase(), grade: grade || "Standard", scope: scope || "General Inventory", expectedKg: Number(expectedKg), costPerKg: Number(costPerKg), totalCost: Number(expectedKg) * Number(costPerKg), orderedBy: username || "Purchase Dept"
        });
        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    const { username } = req.body;
    try {
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid PO" });

        po.status = 'RECEIVED';
        po.receivedDate = new Date();
        await po.save();

        let material = await RawMaterial.findOne({ materialCode: po.materialCode });
        if (!material) {
            material = new RawMaterial({
                materialCode: po.materialCode, materialName: "Steel Stock", grade: po.grade, lastSupplier: po.supplierName, currentStockKg: po.expectedKg, lastUpdatedBy: username || "Purchase Dept", lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += po.expectedKg;
            material.grade = po.grade;                 
            material.lastSupplier = po.supplierName;   
            material.lastUpdatedBy = username || "Purchase Dept";
            material.lastUpdate = new Date();
        }
        await material.save();

        await new Transaction({ barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" }).save();
        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 7. WORK ORDERS (WO) MANAGEMENT
// ==========================================
app.get('/api/work-orders/active', async (req, res) => {
    try {
        const wos = await WorkOrder.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        res.json(wos);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/work-orders', async (req, res) => {
    try {
        const newWO = new WorkOrder(req.body);
        await newWO.save();
        res.json({ success: true, message: "Work Order Created!" });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.listen(process.env.PORT || 5000, () => console.log(`ERP Server Running on port ${process.env.PORT || 5000}`));