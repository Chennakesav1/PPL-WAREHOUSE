const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// CRITICAL FIX: We are importing ProductionBatch here!
const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch } = require('./models');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ==========================================
// 1. ROLE-BASED LOGIN (Split for Security)
// ==========================================
const DASHBOARD_USERS = {
    "admin":  { pass: "admin123",  role: "ADMIN" },
    "buyer":  { pass: "buy123",    role: "PURCHASE" },
    "maker":  { pass: "make123",   role: "PRODUCTION" },
    "seller": { pass: "sell123",   role: "SALES" }      
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
// 2. PRODUCTION DEPT (COMPREHENSIVE)
// ==========================================
app.get('/api/production/batches', async (req, res) => {
    try {
        const batches = await ProductionBatch.find().sort({ date: -1 }).limit(200);
        res.json(batches);
    } catch (err) { res.status(500).json({ error: "Server error fetching batches" }); }
});
// ==========================================
// PRODUCTION DEPT: Massive Form Submit
// ==========================================
app.post('/api/production/batch', async (req, res) => {
    try {
        // Only deduct RM if Forging
        if (req.body.stage === 'FORGING' && req.body.rawMaterialCode && req.body.rawMaterialConsumedKg > 0) {
            const material = await RawMaterial.findOne({ materialCode: req.body.rawMaterialCode.toUpperCase() });
            if (material && material.currentStockKg >= req.body.rawMaterialConsumedKg) {
                material.currentStockKg -= Number(req.body.rawMaterialConsumedKg);
                await material.save();
            }
        }

        // Map all 40+ fields directly from the request
        const newBatch = new ProductionBatch({
            ...req.body,
            date: req.body.date ? new Date(req.body.date) : new Date(),
            // Ensure numbers are saved as numbers
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
            // Losses
            lossMajorJC: Number(req.body.lossMajorJC) || 0, lossMinorJC: Number(req.body.lossMinorJC) || 0,
            lossSetting: Number(req.body.lossSetting) || 0, lossMcClean: Number(req.body.lossMcClean) || 0,
            lossToolRework: Number(req.body.lossToolRework) || 0, lossNoTool: Number(req.body.lossNoTool) || 0,
            lossNoLoad: Number(req.body.lossNoLoad) || 0, lossNoOperator: Number(req.body.lossNoOperator) || 0,
            lossMMnt: Number(req.body.lossMMnt) || 0, lossEMnt: Number(req.body.lossEMnt) || 0,
            lossNoPower: Number(req.body.lossNoPower) || 0, lossNoAirOil: Number(req.body.lossNoAirOil) || 0,
            lossNoRm: Number(req.body.lossNoRm) || 0, lossRmLoading: Number(req.body.lossRmLoading) || 0,
            lossQaApproval: Number(req.body.lossQaApproval) || 0, lossCoilChange: Number(req.body.lossCoilChange) || 0,
            lossNoPlan: Number(req.body.lossNoPlan) || 0, lossNpdTeam: Number(req.body.lossNpdTeam) || 0,
            lossUnknown: Number(req.body.lossUnknown) || 0
        });
        
        await newBatch.save();

        if (req.body.stage === 'SEC_OP' || req.body.stage === 'ROLLING') {
            const product = await Product.findOne({ barcode: req.body.partNo }); // Linking by partNo
            if (product) {
                product.currentStock += Number(req.body.acceptedQty);
                await product.save();
                await new Transaction({ barcode: req.body.partNo, type: 'PRODUCTION', quantity: req.body.acceptedQty, resultingStock: product.currentStock, user: req.body.loggedBy }).save();
            }
        }
        res.json({ success: true, message: `Production Logged!` });
    } catch (err) { res.status(500).json({ error: "Production error" }); }
});

// ==========================================
// 3. PURCHASE DEPT: Purchase Orders (PO)
// ==========================================
app.get('/api/purchase-orders', async (req, res) => {
    try {
        const pos = await PurchaseOrder.find().sort({ orderDate: -1 });
        res.json(pos);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/purchase-orders', async (req, res) => {
    const { supplierName, materialCode, grade, scope, expectedKg, costPerKg, username } = req.body;
    try {
        const newPO = new PurchaseOrder({
            poNumber: `PO-${Date.now()}`,
            supplierName,
            materialCode: materialCode.toUpperCase(),
            grade: grade || "Standard", 
            scope: scope || "General Inventory", 
            expectedKg: Number(expectedKg),
            costPerKg: Number(costPerKg),
            totalCost: Number(expectedKg) * Number(costPerKg),
            orderedBy: username || "Purchase Dept"
        });
        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: "Server error creating PO" }); }
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
                materialCode: po.materialCode, materialName: "Steel Stock", currentStockKg: po.expectedKg,
                lastUpdatedBy: username || "Purchase Dept", lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += po.expectedKg;
            material.lastUpdatedBy = username || "Purchase Dept";
            material.lastUpdate = new Date();
        }
        await material.save();

        await new Transaction({ 
            barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, 
            type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" 
        }).save();

        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: "Server error receiving PO" }); }
});

// ==========================================
// 4. PURCHASE DEPT: Manage Raw Materials
// ==========================================
app.get('/api/raw-materials', async (req, res) => {
    try {
        let materials = await RawMaterial.find(); 
        res.json(materials);
    } catch (err) { res.status(500).json({ error: "Server error fetching materials" }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    const { materialCode, materialName, addedKg, username } = req.body; 
    try {
        let material = await RawMaterial.findOne({ materialCode });
        if (!material) {
            material = new RawMaterial({ 
                materialCode, materialName: materialName || "Carbon Steel", currentStockKg: addedKg,
                lastUpdatedBy: username || 'Purchase Dept', lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += Number(addedKg);
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            if (materialName && materialName.trim() !== "") material.materialName = materialName.trim(); 
        }
        await material.save();

        await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username || 'Purchase Dept' }).save();
        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ==========================================
// 5. INVENTORY & TRANSACTIONS
// ==========================================
app.get('/api/product/:barcode', async (req, res) => {
    try {
        const product = await Product.findOne({ barcode: req.params.barcode.trim() });
        if (!product) return res.status(404).json({ message: "Product not found" });
        res.json(product);
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ productCode: 1 });
        res.json(products);
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 }).limit(100);
        res.json(transactions);
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { productCode, sector, type, grade, af, length, weightPerPc, currentStock } = req.body;
        const barcode = productCode.trim();
        const existing = await Product.findOne({ barcode });
        if (existing) return res.status(400).json({ success: false, message: "Product Code already exists!" });

        const newProduct = new Product({
            barcode, productCode: barcode, sector, type, grade, af: af || null, length: length || null, weightPerPc: weightPerPc || 0, currentStock: currentStock || 0
        });
        await newProduct.save();

        if (currentStock > 0) {
            await new Transaction({ barcode, type: 'INWARD', quantity: currentStock, resultingStock: currentStock, user: "Admin (New Item)" }).save();
        }
        res.json({ success: true, message: "Product Added Successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Server Error saving product." }); }
});

app.post('/api/stock', async (req, res) => {
    const { barcode, type, quantity, username } = req.body; 
    try {
        const product = await Product.findOne({ barcode });
        if (!product) return res.status(404).json({ message: "Product not found" });

        const qty = parseInt(quantity);
        if (type === 'INWARD') product.currentStock += qty;
        else if (type === 'DISPATCH') {
            if (product.currentStock < qty) return res.status(400).json({ message: "Not enough stock" });
            product.currentStock -= qty;
        }
        await product.save();
        await new Transaction({ barcode, type, quantity: qty, resultingStock: product.currentStock, user: username || "Unknown" }).save();
        res.json({ message: "Success", newStock: product.currentStock });
    } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try {
        const updatedItem = await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { new: true });
        if (!updatedItem) return res.status(404).json({ message: "Item not found" });
        res.status(200).json(updatedItem);
    } catch (error) { res.status(500).json({ message: "Server error updating stock" }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const deletedItem = await Product.findByIdAndDelete(req.params.id);
        if (!deletedItem) return res.status(404).json({ message: "Item not found" });
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) { res.status(500).json({ message: "Server error deleting item" }); }
});

app.listen(process.env.PORT || 5000, () => console.log("ERP Server Running"));