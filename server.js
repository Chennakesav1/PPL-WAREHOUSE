const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Product, Transaction } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());


// ==========================================
// 🌟 SERVE THE WEB DASHBOARD
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ==========================================
// 1. WEB DASHBOARD LOGIN ROUTE
// ==========================================
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    // 👉 THIS IS THE PASSWORD FOR THE WEBSITE
    const SECRET_PASSWORD = 'Admin12345'; 

    if (password === SECRET_PASSWORD) {
        res.json({ success: true, message: "Welcome to the Dashboard" });
    } else {
        res.status(401).json({ success: false, message: "Incorrect Password" });
    }
});

// ==========================================
// 2. MOBILE APP LOGIN ROUTE
// ==========================================
app.post('/api/app-login', (req, res) => {
    const { username, password } = req.body;

    // 👉 THESE ARE THE USERNAMES & PASSWORDS FOR THE MOBILE APP
    const allowedUsers = {
        "admin": "admin123",
        "worker1": "bolt1234",
        "worker2": "bolt4567"
    };

    if (allowedUsers[username] && allowedUsers[username] === password) {
        res.json({ success: true, message: "App login successful" });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});


// ==========================================
// UPDATE STOCK ROUTE
// ==========================================
app.put('/api/inventory/:id', async (req, res) => {
    try {
        console.log(`Attempting to update stock for ID: ${req.params.id} to ${req.body.stock}`);
        
        // IMPORTANT: Ensure 'Product' matches the name of your Mongoose model!
        const updatedItem = await Product.findByIdAndUpdate(
            req.params.id, 
            { currentStock: req.body.stock }, // <-- FIXED: Changed to 'currentStock' to match your DB
            { new: true }
        );
        
        if (!updatedItem) {
            console.log("Item not found in database.");
            return res.status(404).json({ message: "Item not found" });
        }
        
        console.log("Stock updated successfully!");
        res.status(200).json(updatedItem);
    } catch (error) {
        console.error("Error updating stock:", error);
        res.status(500).json({ message: "Server error updating stock" });
    }
});

// ==========================================
// DELETE PRODUCT ROUTE
// ==========================================
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        console.log(`Attempting to delete product ID: ${req.params.id}`);
        
        const deletedItem = await Product.findByIdAndDelete(req.params.id);
        
        if (!deletedItem) {
            return res.status(404).json({ message: "Item not found" });
        }
        
        console.log("Product deleted successfully!");
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).json({ message: "Server error deleting item" });
    }
});

// ==========================================
// 3. INVENTORY & TRANSACTION ROUTES
// ==========================================

// Get Single Product for Mobile Scanner
app.get('/api/product/:barcode', async (req, res) => {
    try {
        const product = await Product.findOne({ barcode: req.params.barcode.trim() });
        if (!product) return res.status(404).json({ message: "Product not found" });
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Get All Products for Web Dashboard
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ productCode: 1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: "Server error fetching products" });
    }
});

// Get Recent Movements for Web Dashboard
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 }).limit(100);
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: "Server error fetching transactions" });
    }
});
// ==========================================
// 🌟 ADD A NEW PRODUCT ROUTE (Updated with Length & Grade)
// ==========================================
app.post('/api/products', async (req, res) => {
    try {
        // 👇 NEW: Added length and grade to the incoming data
        const { productCode, sector, type, grade, af, length, weightPerPc, currentStock } = req.body;
        
        const barcode = productCode.trim();

        const existing = await Product.findOne({ barcode });
        if (existing) {
            return res.status(400).json({ success: false, message: "Product Code already exists!" });
        }

        // 👇 NEW: Save length and grade to the database
        const newProduct = new Product({
            barcode: barcode,
            productCode: barcode,
            sector: sector,
            type: type,
            grade: grade, 
            af: af || null,
            length: length || null, 
            weightPerPc: weightPerPc || 0,
            currentStock: currentStock || 0
        });

        await newProduct.save();

        if (currentStock > 0) {
            const tx = new Transaction({
                barcode: barcode,
                type: 'INWARD',
                quantity: currentStock,
                resultingStock: currentStock,
                user: "Admin (New Item)" 
            });
            await tx.save();
        }

        res.json({ success: true, message: "Product Added Successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error saving product." });
    }
});
// Update Stock and Save Movement History
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
            user: username || "Unknown" // Logs who made the change
        });
        await transaction.save();

        res.json({ message: "Success", newStock: product.currentStock });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));