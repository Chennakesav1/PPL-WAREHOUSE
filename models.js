const mongoose = require('mongoose');

// 1. Define Product Schema
const productSchema = new mongoose.Schema({
  barcode: { type: String, required: true, unique: true },
  productCode: String,
  sector: String,
  type: String, 
  Group: String,
  length: Number,
  af: Number,
  grade: String,
  weightPerPc: Number,
  perboxquantity: Number,
  Numofboxes: Number,
  currentStock: { type: Number, default: 0 }
});

// 2. Define Transaction Schema
const transactionSchema = new mongoose.Schema({
  barcode: String,
  type: { type: String, enum: ['INWARD', 'DISPATCH'] },
  quantity: Number,
  resultingStock: Number, 
  user: String, 
  date: { type: Date, default: Date.now }
});

// 3. Define Raw Material Schema
const rawMaterialSchema = new mongoose.Schema({
  materialCode: { type: String, required: true, unique: true },
  materialName: String,
  grade: String,
  currentStockKg: { type: Number, default: 0 },
  lastUpdatedBy: String,
  lastUpdate: { type: Date, default: Date.now }
});

// 4. Define Purchase Order Schema
const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, unique: true },
  supplierName: String,
  materialCode: String,
  grade: String,   // NEW: Track the steel grade
  scope: String,   // NEW: Track the project scope or remarks
  expectedKg: Number,
  costPerKg: Number,
  totalCost: Number,
  status: { type: String, enum: ['PENDING', 'RECEIVED'], default: 'PENDING' },
  orderedBy: String,
  orderDate: { type: Date, default: Date.now },
  receivedDate: Date
});

// 5. Define Multi-Stage Production Batch Schema
const productionBatchSchema = new mongoose.Schema({
  workOrderNo: String,
  productBarcode: String,
  stage: { type: String, enum: ['FORGING', 'ROLLING', 'SEC_OP'], required: true },
  machineName: String,
  operator: String,
  acceptedQty: Number,
  rejectedQty: Number,
  rawMaterialConsumedKg: Number, // Only needed for Forging
  date: { type: Date, default: Date.now }
});

// Add it to your exports at the bottom:
module.exports = {
  Product: mongoose.model('Product', productSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  RawMaterial: mongoose.model('RawMaterial', rawMaterialSchema),
  PurchaseOrder: mongoose.model('PurchaseOrder', purchaseOrderSchema),
  ProductionBatch: mongoose.model('ProductionBatch', productionBatchSchema) // NEW
};