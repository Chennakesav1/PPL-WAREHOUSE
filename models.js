const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    barcode: { type: String, required: true, unique: true },
    productCode: String,
    sector: String,
    type: String,
    grade: String,
    af: Number,
    length: Number,
    weightPerPc: Number,
    currentStock: { type: Number, default: 0 },
    wipStock: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
    barcode: String,
    type: { type: String, enum: ['INWARD', 'DISPATCH', 'PRODUCTION', 'ADJUSTMENT', 'QC_APPROVAL'] },
    quantity: Number,
    resultingStock: Number,
    user: String,
    date: { type: Date, default: Date.now }
});

const rawMaterialSchema = new mongoose.Schema({
    materialCode: { type: String, required: true, unique: true },
    materialName: String,
    grade: String,  
    scope: String,         // NEW: Links to PO Grade
    lastSupplier: String,  
      // NEW: Links to PO Supplier
    currentStockKg: { type: Number, default: 0 },
    lastUpdatedBy: String,
    lastUpdate: { type: Date, default: Date.now }
});

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: String,
    supplierName: String,
    materialCode: String,
    grade: String,
    scope: String,
    expectedKg: Number,
    costPerKg: Number,
    totalCost: Number,
    status: { type: String, enum: ['PENDING', 'RECEIVED'], default: 'PENDING' },
    orderedBy: String,
    orderDate: { type: Date, default: Date.now },
    receivedDate: Date
});

// THE MASSIVE 40-COLUMN MES PRODUCTION SCHEMA
const productionBatchSchema = new mongoose.Schema({
    batchNumber: { type: String, unique: true, sparse: true },
    date: { type: Date, default: Date.now },
    stage: { type: String, enum: ['FORGING', 'ROLLING', 'SEC_OP'], required: true },
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
    rawMaterialCode: String,
    heatNo: String,
    rawMaterialConsumedKg: { type: Number, default: 0 },
    pieceWeightKg: { type: Number, default: 0 },
    scheduleHours: { type: Number, default: 0 },
    jobChangeHours: { type: Number, default: 0 },
    prodPlannedHours: { type: Number, default: 0 },
    speedRpm: { type: Number, default: 0 },
    shiftTargetQty: { type: Number, default: 0 },
    acceptedQty: { type: Number, default: 0 },
    rejectedQty: { type: Number, default: 0 },
    rejectionKg: { type: Number, default: 0 },
    rejectionReason: String,
    remarks: String,
    
    
    // Downtime Losses
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
    
    
    loggedBy: String,
    qcStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    qcBy: String,
    qcDate: Date,
    qcRemarks: String
});

// NEW: Work Order Schema
const workOrderSchema = new mongoose.Schema({
    woNumber: { type: String, required: true, unique: true },
    partNo: String,
    partName: String,
    targetQty: Number,
    producedQty: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Transaction: mongoose.model('Transaction', transactionSchema),
    RawMaterial: mongoose.model('RawMaterial', rawMaterialSchema),
    PurchaseOrder: mongoose.model('PurchaseOrder', purchaseOrderSchema),
    ProductionBatch: mongoose.model('ProductionBatch', productionBatchSchema),
    WorkOrder: mongoose.model('WorkOrder', workOrderSchema) // <-- ADD THIS
};