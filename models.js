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
  user: String, // <--- THIS IS THE MAGIC WORD WE WERE MISSING!
  date: { type: Date, default: Date.now }
});

// 3. Export them
module.exports = {
  Product: mongoose.model('Product', productSchema),
  Transaction: mongoose.model('Transaction', transactionSchema)
};