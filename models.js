const mongoose = require('mongoose');

// 1. RAW MATERIALS (Used by Purchase & Production)
const rawMaterialSchema = new mongoose.Schema({
  materialName: String, // e.g., Steel Rod 10mm
  grade: String,        // e.g., Grade 8.8 Steel
  currentStock: { type: Number, default: 0 },
  unit: { type: String, default: 'kg' }
});

// 2. PURCHASE ORDERS (Used by Purchase Dept)
const purchaseOrderSchema = new mongoose.Schema({
  poNumber: String,
  supplier: String,
  items: [{ materialId: mongoose.Schema.Types.ObjectId, quantity: Number, price: Number }],
  status: { type: String, enum: ['PENDING', 'RECEIVED'], default: 'PENDING' },
  date: { type: Date, default: Date.now }
});

// 3. PRODUCTION BATCHES (Used by Production Dept)
const productionSchema = new mongoose.Schema({
  productCode: String,
  quantityProduced: Number,
  rawMaterialUsed: Number, // kg
  workerName: String,
  timestamp: { type: Date, default: Date.now }
});

// 4. SALES ORDERS (Used by Sales Dept)
const salesOrderSchema = new mongoose.Schema({
  orderId: String,
  customerName: String,
  items: [{ productCode: String, qty: Number, rate: Number }],
  totalAmount: Number,
  status: { type: String, enum: ['OPEN', 'SHIPPED', 'PAID'], default: 'OPEN' }
});

module.exports = {
  Product: mongoose.model('Product', require('./productSchema')), // Keep your existing one
  Transaction: mongoose.model('Transaction', require('./txSchema')), // Keep your existing one
  RawMaterial: mongoose.model('RawMaterial', rawMaterialSchema),
  PurchaseOrder: mongoose.model('PurchaseOrder', purchaseOrderSchema),
  ProductionBatch: mongoose.model('ProductionBatch', productionSchema),
  SalesOrder: mongoose.model('SalesOrder', salesOrderSchema)
};