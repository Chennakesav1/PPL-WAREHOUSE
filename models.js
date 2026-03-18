const mongoose = require('mongoose');

// 1. Finished Goods (Bolts)
const productSchema = new mongoose.Schema({
  barcode: { type: String, required: true, unique: true },
  productCode: String,
  sector: String,
  type: String, 
  grade: String,
  length: Number,
  af: Number,
  weightPerPc: Number,
  currentStock: { type: Number, default: 0 }
});

// 2. Transaction History
const transactionSchema = new mongoose.Schema({
  barcode: String,
  type: { type: String, enum: ['INWARD', 'DISPATCH', 'PRODUCTION', 'ADJUSTMENT'] },
  quantity: Number,
  resultingStock: Number, 
  user: String,
  date: { type: Date, default: Date.now }
});

// 3. Raw Materials (Steel Rods, Wire, etc.)
const rawMaterialSchema = new mongoose.Schema({
  materialCode: { type: String, required: true, unique: true },
  materialName: String,
  grade: String,
  currentStockKg: { type: Number, default: 0 },
  lastUpdatedBy: String, // NEW: Tracks the user
  lastUpdate: { type: Date, default: Date.now } // NEW: Tracks the exact time
});

// 4. Production Batches (Connecting Raw Material to Finished Goods)
const productionBatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, unique: true },
  productBarcode: String,
  quantityProduced: Number, // How many bolts made
  rawMaterialUsedCode: String, 
  rawMaterialConsumedKg: Number, // How much steel used
  producedBy: String,
  date: { type: Date, default: Date.now }
});

// 5. Sales Orders
const salesOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerName: String,
  productBarcode: String,
  quantitySold: Number,
  soldBy: String,
  date: { type: Date, default: Date.now }
});

module.exports = {
  Product: mongoose.model('Product', productSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  RawMaterial: mongoose.model('RawMaterial', rawMaterialSchema),
  ProductionBatch: mongoose.model('ProductionBatch', productionBatchSchema),
  SalesOrder: mongoose.model('SalesOrder', salesOrderSchema)
};