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

const productionBatchSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  stage: { type: String, enum: ['FORGING', 'ROLLING', 'SEC_OP'], required: true },
  
  // 1. General & Part Info
  machineName: String,
  operator: String,
  shift: String,
  partNo: String,
  workOrderNo: String,
  partSize: String,
  pitch: String,
  length: Number,
  partName: String,
  af: String,
  productGrade: String,
  operation: String, 
  
  // 2. Material Details
  rawMaterialCode: String,
  heatNo: String,
  rawMaterialConsumedKg: { type: Number, default: 0 },
  pieceWeightKg: { type: Number, default: 0 },
  
  // 3. Planning & Targets
  scheduleHours: { type: Number, default: 0 },
  jobChangeHours: { type: Number, default: 0 },
  prodPlannedHours: { type: Number, default: 0 },
  speedRpm: { type: Number, default: 0 },
  shiftTargetQty: { type: Number, default: 0 },
  
  // 4. Production & Rejections
  acceptedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  rejectionKg: { type: Number, default: 0 }, // Process Rejection & Setting Rejection in KGS
  rejectionReason: String, // From Sec Op
  remarks: String,
  
  // 5. Downtime / Losses Breakdown (IN MINUTES)
  lossMajorJC: { type: Number, default: 0 },
  lossMinorJC: { type: Number, default: 0 },
  lossSetting: { type: Number, default: 0 },
  lossMcClean: { type: Number, default: 0 },
  lossToolRework: { type: Number, default: 0 },
  lossNoTool: { type: Number, default: 0 },
  lossNoLoad: { type: Number, default: 0 },
  lossNoOperator: { type: Number, default: 0 },
  lossMMnt: { type: Number, default: 0 },
  lossEMnt: { type: Number, default: 0 },
  lossNoPower: { type: Number, default: 0 },
  lossNoAirOil: { type: Number, default: 0 },
  lossNoRm: { type: Number, default: 0 },
  lossRmLoading: { type: Number, default: 0 },
  lossQaApproval: { type: Number, default: 0 },
  lossCoilChange: { type: Number, default: 0 },
  lossNoPlan: { type: Number, default: 0 },
  lossNpdTeam: { type: Number, default: 0 },
  lossUnknown: { type: Number, default: 0 },

  loggedBy: String
});

module.exports = {
  Product: mongoose.model('Product', productSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  RawMaterial: mongoose.model('RawMaterial', rawMaterialSchema),
  PurchaseOrder: mongoose.model('PurchaseOrder', purchaseOrderSchema),
  ProductionBatch: mongoose.model('ProductionBatch', productionBatchSchema)
};