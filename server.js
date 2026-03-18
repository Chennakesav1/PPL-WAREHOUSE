const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const { Product, Transaction, User, RawMaterial, PurchaseOrder, Order, ProductionBatch, Invoice } = require('./models');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ==========================================
// 1. ROLE-BASED LOGIN (Web & App)
// ==========================================
const USERS = {
    "admin": { pass: "admin123", role: "ADMIN" },
    "buyer": { pass: "buy123", role: "PURCHASE" },
    "maker": { pass: "make123", role: "PRODUCTION" },
    "seller": { pass: "sell123", role: "SALES" }
};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (USERS[username] && USERS[username].pass === password) {
        res.json({ success: true, role: USERS[username].role, username: username });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});
// ==========================================
// PURCHASE DEPT: Manage Raw Materials
// ==========================================

// 1. GET ROUTE (This will auto-fix "N/A" the second you load the page)
app.get('/api/raw-materials', async (req, res) => {
    try {
        let materials = await RawMaterial.find(); 
        
        let needsSave = false;
        for (let m of materials) {
            // Forcefully fix missing dates and "N/A"
            if (!m.lastUpdate || !m.lastUpdatedBy) {
                m.lastUpdate = new Date(); 
                m.lastUpdatedBy = "System (Auto-Fixed)";
                needsSave = true;
            }
            // Forcefully remove "New Steel" from old entries
            if (m.materialName === "New Steel") {
                m.materialName = "Steel Stock";
                needsSave = true;
            }
            if (needsSave) await m.save(); // Save the fix permanently
        }
        res.json(materials);
    } catch (err) { 
        res.status(500).json({ error: "Server error fetching materials" }); 
    }
});


// ==========================================
// PURCHASE DEPT: Purchase Orders (PO)
// ==========================================

// Get all POs
app.get('/api/purchase-orders', async (req, res) => {
    try {
        const pos = await PurchaseOrder.find().sort({ orderDate: -1 });
        res.json(pos);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Create a new PO (Pending)
app.post('/api/purchase-orders', async (req, res) => {
    const { supplierName, materialCode, expectedKg, costPerKg, username } = req.body;
    try {
        const newPO = new PurchaseOrder({
            poNumber: `PO-${Date.now()}`,
            supplierName,
            materialCode: materialCode.toUpperCase(),
            expectedKg: Number(expectedKg),
            costPerKg: Number(costPerKg),
            totalCost: Number(expectedKg) * Number(costPerKg),
            orderedBy: username
        });
        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: "Server error creating PO" }); }
});

// Receive a PO (GRN) - This auto-updates Raw Materials!
app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    const { username } = req.body;
    try {
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid or already received PO" });

        // 1. Mark PO as Received
        po.status = 'RECEIVED';
        po.receivedDate = new Date();
        await po.save();

        // 2. Add stock to Raw Materials automatically
        let material = await RawMaterial.findOne({ materialCode: po.materialCode });
        if (!material) {
            material = new RawMaterial({ 
                materialCode: po.materialCode, materialName: "Steel Stock", currentStockKg: po.expectedKg,
                lastUpdatedBy: username, lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += po.expectedKg;
            material.lastUpdatedBy = username;
            material.lastUpdate = new Date();
        }
        await material.save();

        // 3. Log the Transaction
        await new Transaction({ 
            barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, 
            type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username 
        }).save();

        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: "Server error receiving PO" }); }
});

// 2. POST ROUTE (This aggressively overwrites the name when you type it)
app.post('/api/raw-materials/receive', async (req, res) => {
    const { materialCode, materialName, addedKg, username } = req.body; 
    
    try {
        let material = await RawMaterial.findOne({ materialCode });
        
        if (!material) {
            material = new RawMaterial({ 
                materialCode, 
                materialName: materialName || "Carbon Steel", 
                currentStockKg: addedKg,
                lastUpdatedBy: username || 'Purchase Dept',
                lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += Number(addedKg);
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            
            // CRITICAL FIX: Aggressively update the name if you typed one
            if (materialName && materialName.trim() !== "") {
                material.materialName = materialName.trim(); 
            }
        }
        await material.save();

        await new Transaction({ 
            barcode: `[RAW] ${materialCode}`, 
            type: 'INWARD', 
            quantity: addedKg, 
            resultingStock: material.currentStockKg, 
            user: username || 'Purchase Dept' 
        }).save();

        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    // NEW: We receive the materialName from the frontend
    const { materialCode, materialName, addedKg, username } = req.body; 
    
    try {
        let material = await RawMaterial.findOne({ materialCode });
        
        if (!material) {
            // Create brand new material
            material = new RawMaterial({ 
                materialCode, 
                materialName: materialName || "Steel Stock", // Uses what you typed
                currentStockKg: addedKg,
                lastUpdatedBy: username || 'Purchase Dept',
                lastUpdate: new Date()
            });
        } else {
            // Update existing material
            material.currentStockKg += Number(addedKg);
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            // If you typed a new name, it overrides the old one
            if (materialName) material.materialName = materialName; 
        }
        await material.save();

        await new Transaction({ 
            barcode: `[RAW] ${materialCode}`, 
            type: 'INWARD', 
            quantity: addedKg, 
            resultingStock: material.currentStockKg, 
            user: username || 'Purchase Dept' 
        }).save();

        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ==========================================
// PURCHASE DEPT: Manage Raw Materials
// ==========================================
app.post('/api/raw-materials/receive', async (req, res) => {
    const { materialCode, addedKg, username } = req.body; 
    
    try {
        let material = await RawMaterial.findOne({ materialCode });
        if (!material) {
            material = new RawMaterial({ 
                materialCode, 
                materialName: "Steel Stock", 
                currentStockKg: addedKg,
                lastUpdatedBy: username || 'Purchase Dept',
                lastUpdate: new Date()
            });
        } else {
            material.currentStockKg += Number(addedKg);
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
        }
        await material.save();

        // Log this in the Recent Movements table
        await new Transaction({ 
            barcode: `[RAW] ${materialCode}`, 
            type: 'INWARD', 
            quantity: addedKg, 
            resultingStock: material.currentStockKg, 
            user: username || 'Purchase Dept' 
        }).save();

        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ==========================================
// 3. PRODUCTION DEPT: Create Finished Goods
// ==========================================
app.post('/api/production/batch', async (req, res) => {
    const { productBarcode, quantityProduced, rawMaterialCode, rawMaterialConsumedKg, username } = req.body;
    
    try {
        // 1. Deduct Raw Material
        const material = await RawMaterial.findOne({ materialCode: rawMaterialCode });
        if (!material || material.currentStockKg < rawMaterialConsumedKg) {
            return res.status(400).json({ message: "Not enough raw material in stock!" });
        }
        material.currentStockKg -= Number(rawMaterialConsumedKg);
        await material.save();

        // 2. Add to Finished Goods
        const product = await Product.findOne({ barcode: productBarcode });
        if (!product) return res.status(404).json({ message: "Finished product code not found." });
        product.currentStock += Number(quantityProduced);
        await product.save();

        // 3. Log the Batch
        const batch = new ProductionBatch({
            batchId: `BATCH-${Date.now()}`,
            productBarcode,
            quantityProduced,
            rawMaterialUsedCode: rawMaterialCode,
            rawMaterialConsumedKg,
            producedBy: username
        });
        await batch.save();

        // 4. Log the Transaction
        await new Transaction({ barcode: productBarcode, type: 'PRODUCTION', quantity: quantityProduced, resultingStock: product.currentStock, user: username }).save();

        res.json({ success: true, message: "Batch recorded successfully!" });
    } catch (err) { res.status(500).json({ error: "Production error" }); }
});

// ==========================================
// 4. SALES DEPT: Dispatch Goods
// ==========================================
app.post('/api/sales/order', async (req, res) => {
    const { productBarcode, quantitySold, customerName, username } = req.body;
    
    try {
        const product = await Product.findOne({ barcode: productBarcode });
        if (!product || product.currentStock < quantitySold) {
            return res.status(400).json({ message: "Not enough finished goods in stock!" });
        }
        
        // Deduct Stock
        product.currentStock -= Number(quantitySold);
        await product.save();

        // Create Order
        const order = new SalesOrder({
            orderId: `ORD-${Date.now()}`,
            customerName,
            productBarcode,
            quantitySold,
            soldBy: username
        });
        await order.save();

        // Log Transaction
        await new Transaction({ barcode: productBarcode, type: 'DISPATCH', quantity: quantitySold, resultingStock: product.currentStock, user: username }).save();

        res.json({ success: true, message: "Order processed and dispatched!" });
    } catch (err) { res.status(500).json({ error: "Sales error" }); }
});

// ==========================================
// Keep your existing product GET routes here
// ==========================================
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ productCode: 1 });
    res.json(products);
});
app.get('/api/product/:barcode', async (req, res) => {
    const product = await Product.findOne({ barcode: req.params.barcode.trim() });
    res.json(product);
});

// ==========================================
// 5. ADMIN/PURCHASE: Standard Stock Adjustment
// ==========================================
app.post('/api/stock', async (req, res) => {
    const { barcode, type, quantity, username } = req.body; 
    try {
        const product = await Product.findOne({ barcode });
        if (!product) return res.status(404).json({ message: "Product not found" });

        const qty = parseInt(quantity);
        if (type === 'INWARD') {
            product.currentStock += qty;
        } else if (type === 'DISPATCH') {
            if (product.currentStock < qty) return res.status(400).json({ message: "Not enough stock" });
            product.currentStock -= qty;
        }

        await product.save();

        const transaction = new Transaction({ 
            barcode: barcode, 
            type: type, 
            quantity: qty,
            resultingStock: product.currentStock,
            user: username || "Unknown"
        });
        await transaction.save();

        res.json({ message: "Success", newStock: product.currentStock });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// ==========================================
// 6. WEB DASHBOARD ROUTES
// ==========================================

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get all transactions for the dashboard table
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 }).limit(100);
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: "Server error fetching transactions" });
    }
});

// Add a brand new product from the Web Dashboard
app.post('/api/products', async (req, res) => {
    try {
        const { productCode, sector, type, grade, af, length, weightPerPc, currentStock } = req.body;
        const barcode = productCode.trim();

        const existing = await Product.findOne({ barcode });
        if (existing) return res.status(400).json({ success: false, message: "Product Code already exists!" });

        const newProduct = new Product({
            barcode, productCode: barcode, sector, type, grade, af, length, weightPerPc, currentStock: currentStock || 0
        });
        await newProduct.save();

        if (currentStock > 0) {
            await new Transaction({ barcode, type: 'INWARD', quantity: currentStock, resultingStock: currentStock, user: "Admin (New Item)" }).save();
        }
        res.json({ success: true, message: "Product Added Successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error saving product." });
    }
});

// Manual override edit from Web Dashboard
app.put('/api/inventory/:id', async (req, res) => {
    try {
        const updatedItem = await Product.findByIdAndUpdate(
            req.params.id, { currentStock: req.body.stock }, { new: true }
        );
        if (!updatedItem) return res.status(404).json({ message: "Item not found" });
        res.status(200).json(updatedItem);
    } catch (error) { res.status(500).json({ message: "Server error updating stock" }); }
});

// Delete a product from Web Dashboard
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const deletedItem = await Product.findByIdAndDelete(req.params.id);
        if (!deletedItem) return res.status(404).json({ message: "Item not found" });
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) { res.status(500).json({ message: "Server error deleting item" }); }
});


// ==========================================
// PURCHASE DEPT: Purchase Orders (PO)
// ==========================================

// Get all POs
app.get('/api/purchase-orders', async (req, res) => {
    try {
        const pos = await PurchaseOrder.find().sort({ orderDate: -1 });
        res.json(pos);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Create a new PO (Pending)
app.post('/api/purchase-orders', async (req, res) => {
    const { supplierName, materialCode, expectedKg, costPerKg, username } = req.body;
    try {
        const newPO = new PurchaseOrder({
            poNumber: `PO-${Date.now()}`,
            supplierName,
            materialCode: materialCode.toUpperCase(),
            expectedKg: Number(expectedKg),
            costPerKg: Number(costPerKg),
            totalCost: Number(expectedKg) * Number(costPerKg),
            orderedBy: username || "Purchase Dept"
        });
        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: "Server error creating PO" }); }
});

// Receive a PO (GRN) - This auto-updates Raw Materials!
app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    const { username } = req.body;
    try {
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid or already received PO" });

        // 1. Mark PO as Received
        po.status = 'RECEIVED';
        po.receivedDate = new Date();
        await po.save();

        // 2. Add stock to Raw Materials automatically
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

        // 3. Log the Transaction
        await new Transaction({ 
            barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, 
            type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" 
        }).save();

        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: "Server error receiving PO" }); }
});
app.listen(process.env.PORT || 5000, () => console.log("ERP Server Running"));