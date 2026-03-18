const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// IMPORT EVERYTHING FROM MODELS
const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch } = require('./models');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MONGO ERROR:", err));

// ==========================================
// 1. ROLE-BASED LOGIN 
// ==========================================
const DASHBOARD_USERS = {
    "admin":  { pass: "admin123",  role: "ADMIN" },
    "buyer":  { pass: "buy123",    role: "PURCHASE" },
    "maker":  { pass: "make123",   role: "PRODUCTION" },
    "seller": { pass: "sell123",   role: "SALES" }      
};

app.post('/api/login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    if (password === 'Admin12345' && !username) return res.json({ success: true, role: "ADMIN", username: "Admin" });
    if (DASHBOARD_USERS[username] && DASHBOARD_USERS[username].pass === password) {
        res.json({ success: true, role: DASHBOARD_USERS[username].role, username: username });
    } else res.status(401).json({ success: false, message: "Access Denied." });
});

// ==========================================
// 2. PRODUCTION DEPT: Massive Form Submit
// ==========================================
app.get('/api/production/batches', async (req, res) => {
    try {
        const batches = await ProductionBatch.find().sort({ date: -1 }).limit(200);
        res.json(batches);
    } catch (err) { 
        console.error("GET BATCHES ERROR:", err);
        res.status(500).json({ error: "Server error fetching batches" }); 
    }
});

app.post('/api/production/batch', async (req, res) => {
    try {
        if (req.body.stage === 'FORGING' && req.body.rawMaterialCode && req.body.rawMaterialConsumedKg > 0) {
            const material = await RawMaterial.findOne({ materialCode: req.body.rawMaterialCode.toUpperCase() });
            if (material && material.currentStockKg >= req.body.rawMaterialConsumedKg) {
                material.currentStockKg -= Number(req.body.rawMaterialConsumedKg);
                await material.save();
            }
        }

        const newBatch = new ProductionBatch({
            ...req.body,
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
            lossUnknown: Number(req.body.lossUnknown) || 0
        });
        
        await newBatch.save();

        if (req.body.stage === 'SEC_OP' || req.body.stage === 'ROLLING') {
            const product = await Product.findOne({ barcode: req.body.partNo }); 
            if (product) {
                product.currentStock += Number(req.body.acceptedQty);
                await product.save();
                await new Transaction({ barcode: req.body.partNo, type: 'PRODUCTION', quantity: req.body.acceptedQty, resultingStock: product.currentStock, user: req.body.loggedBy }).save();
            }
        }
        res.json({ success: true, message: `Production Logged!` });
    } catch (err) { 
        console.error("POST BATCH ERROR:", err);
        res.status(500).json({ error: "Production error", details: err.message }); 
    }
});

// ==========================================
// 3. PURCHASE ORDERS & RAW MATERIALS
// ==========================================
app.get('/api/purchase-orders', async (req, res) => {
    try { const pos = await PurchaseOrder.find().sort({ orderDate: -1 }); res.json(pos); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/purchase-orders', async (req, res) => {
    const { supplierName, materialCode, grade, scope, expectedKg, costPerKg, username } = req.body;
    try {
        const newPO = new PurchaseOrder({ poNumber: `PO-${Date.now()}`, supplierName, materialCode: materialCode.toUpperCase(), grade: grade || "Standard", scope: scope || "General Inventory", expectedKg: Number(expectedKg), costPerKg: Number(costPerKg), totalCost: Number(expectedKg) * Number(costPerKg), orderedBy: username || "Purchase Dept" });
        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    try {
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid PO" });

        po.status = 'RECEIVED'; po.receivedDate = new Date(); await po.save();

        let material = await RawMaterial.findOne({ materialCode: po.materialCode });
        if (!material) material = new RawMaterial({ materialCode: po.materialCode, materialName: "Steel Stock", currentStockKg: po.expectedKg, lastUpdatedBy: req.body.username, lastUpdate: new Date() });
        else { material.currentStockKg += po.expectedKg; material.lastUpdatedBy = req.body.username; material.lastUpdate = new Date(); }
        await material.save();

        await new Transaction({ barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: req.body.username }).save();
        res.json({ success: true, message: "Stock Received" });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/raw-materials', async (req, res) => {
    try { const materials = await RawMaterial.find(); res.json(materials); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    const { materialCode, materialName, addedKg, username } = req.body; 
    try {
        let material = await RawMaterial.findOne({ materialCode });
        if (!material) material = new RawMaterial({ materialCode, materialName: materialName || "Carbon Steel", currentStockKg: addedKg, lastUpdatedBy: username, lastUpdate: new Date() });
        else { material.currentStockKg += Number(addedKg); material.lastUpdatedBy = username; material.lastUpdate = new Date(); if (materialName) material.materialName = materialName; }
        await material.save();
        await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username }).save();
        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ==========================================
// 4. INVENTORY & TRANSACTIONS
// ==========================================
app.get('/api/products', async (req, res) => {
    try { const products = await Product.find().sort({ productCode: 1 }); res.json(products); } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/transactions', async (req, res) => {
    try { const transactions = await Transaction.find().sort({ date: -1 }).limit(100); res.json(transactions); } catch (error) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { productCode, sector, type, grade, af, length, weightPerPc, currentStock } = req.body;
        const barcode = productCode.trim();
        const existing = await Product.findOne({ barcode });
        if (existing) return res.status(400).json({ success: false, message: "Product Code already exists!" });

        const newProduct = new Product({ barcode, productCode: barcode, sector, type, grade, af: af || null, length: length || null, weightPerPc: weightPerPc || 0, currentStock: currentStock || 0 });
        await newProduct.save();

        if (currentStock > 0) await new Transaction({ barcode, type: 'INWARD', quantity: currentStock, resultingStock: currentStock, user: "Admin (New Item)" }).save();
        res.json({ success: true, message: "Product Added Successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Server Error" }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try {
        const updatedItem = await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { new: true });
        res.status(200).json(updatedItem);
    } catch (error) { res.status(500).json({ message: "Server error" }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try { await Product.findByIdAndDelete(req.params.id); res.status(200).json({ message: "Deleted" }); } catch (error) { res.status(500).json({ message: "Server error" }); }
});

app.listen(process.env.PORT || 5000, () => console.log("ERP Server Running"));