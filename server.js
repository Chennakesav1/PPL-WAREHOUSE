const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();

// ==========================================
// CORS Configuration
// ==========================================
app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'] 
}));
app.use(express.json());

const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch, WorkOrder, Customer, SalesOrder } = require('./models');

// ==========================================
// EMAIL & PDF SETUP
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'chennakesavarao89@gmail.com',
        pass: process.env.EMAIL_APP_PASSWORD // Setup in Google Account -> App Passwords
    }
});

// Helper to generate an in-memory PDF Invoice Buffer
function generateInvoicePDF(order, customer) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => { resolve(Buffer.concat(buffers)); });

            // Header
            doc.fontSize(24).fillColor('#6f42c1').text('PPL ENTERPRISES', { align: 'center' });
            doc.fontSize(10).fillColor('#555555').text('Hyderabad, Telangana, India', { align: 'center' });
            doc.moveDown();
            doc.fontSize(16).fillColor('#000000').text('TAX INVOICE', { align: 'center', underline: true });
            doc.moveDown();

            // Details
            doc.fontSize(12).text(`Order No: ${order.orderNo}`);
            doc.text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`);
            doc.moveDown();
            doc.text(`Billed To:`, { underline: true });
            doc.text(customer.name);
            doc.text(customer.address || 'Address not provided');
            doc.text(`${customer.email || ''} | ${customer.phone || ''}`);
            doc.moveDown(2);

            // Table Header
            doc.fontSize(12).text('Product Code                 Qty      Price (INR)     Total (INR)', { underline: true });
            doc.moveDown(0.5);

            // Table Rows
            doc.fontSize(10);
            order.items.forEach(item => {
                const row = `${item.productCode.padEnd(25)} ${String(item.quantity).padStart(5)}    ${String(item.unitPrice).padStart(8)}      ${String(item.total).padStart(10)}`;
                doc.text(row);
            });

            // Totals
            doc.moveDown(2);
            doc.fontSize(12).text(`Subtotal: ₹${order.subtotal}`, { align: 'right' });
            doc.text(`GST (18%): ₹${order.gstAmount.toFixed(2)}`, { align: 'right' });
            doc.fontSize(14).fillColor('#28a745').text(`Grand Total: ₹${order.grandTotal.toLocaleString()}`, { align: 'right' });
            doc.end();
        } catch (err) { reject(err); }
    });
}

// Serve the Frontend Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ==========================================
// DB Connection
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection CRASH:", err));

// ==========================================
// AUTHENTICATION
// ==========================================
const DASHBOARD_USERS = {
    "admin": { pass: "admin123", role: "ADMIN" },
    "buyer": { pass: "buy123", role: "PURCHASE" },
    "ppc": { pass: "ppc123", role: "PPC" },
    "maker": { pass: "make123", role: "PRODUCTION" },
    "seller": { pass: "sell123", role: "SALES" },
    "qc": { pass: "qc123", role: "QC" }
};
const WORKER_USERS = { "worker1": { pass: "work123", role: "PRODUCTION" } };

app.post('/api/login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    console.log(`🚨 [LOGIN ATTEMPT] Username: "${username}"`);

    if (password === 'Admin12345' && !username) return res.json({ success: true, role: "ADMIN", username: "Admin" });
    if (DASHBOARD_USERS[username] && DASHBOARD_USERS[username].pass === password) return res.json({ success: true, role: DASHBOARD_USERS[username].role, username: username });
    if (WORKER_USERS[username] && WORKER_USERS[username].pass === password) return res.json({ success: true, role: WORKER_USERS[username].role, username: username });
    
    res.status(401).json({ success: false, message: "Access Denied: Incorrect credentials." });
});

// ==========================================
// UNSUBSCRIBE ENDPOINT
// ==========================================
app.get('/api/unsubscribe/:id', async (req, res) => {
    try {
        await Customer.findByIdAndUpdate(req.params.id, { isSubscribed: false });
        res.send(`<div style="font-family: Arial; text-align: center; margin-top: 50px; color: #555;">
            <h1 style="color: #e83e8c;">Unsubscribed Successfully</h1>
            <p>You have been removed from our marketing mailing list.</p>
        </div>`);
    } catch (err) { res.status(500).send("Error unsubscribing."); }
});

// ==========================================
// TARGETED MARKETING
// ==========================================
app.post('/api/marketing/send-offers', async (req, res) => {
    try {
        const { subject, messageHtml, filter, specificEmail } = req.body;
        let targetCustomers = [];

        // NEW: Check if a specific email was provided, override filters if so
        if (specificEmail && specificEmail.trim() !== "") {
            const singleCustomer = await Customer.findOne({ email: specificEmail.trim() });
            if (!singleCustomer) {
                return res.status(404).json({ error: "Customer with that email not found." });
            }
            if (!singleCustomer.isSubscribed) {
                return res.status(400).json({ error: "Customer has unsubscribed from marketing emails." });
            }
            targetCustomers.push(singleCustomer);
        } 
        else {
            // Normal Filter Logic
            const allCustomers = await Customer.find({ email: { $exists: true, $ne: "" }, isSubscribed: true });
            
            for (let c of allCustomers) {
                if (filter === 'all') {
                    targetCustomers.push(c);
                    continue;
                }

                const orders = await SalesOrder.find({ customerId: c._id, status: { $ne: 'CANCELLED' } });
                let totalSpent = 0;
                let lastOrderDate = null;
                
                orders.forEach(o => {
                    totalSpent += o.grandTotal;
                    if (!lastOrderDate || new Date(o.orderDate) > lastOrderDate) lastOrderDate = new Date(o.orderDate);
                });

                if (filter === 'vip' && totalSpent >= 100000) targetCustomers.push(c); 
                else if (filter === 'inactive') { 
                    const threeMonthsAgo = new Date();
                    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                    if (!lastOrderDate || lastOrderDate < threeMonthsAgo) targetCustomers.push(c);
                }
            }
        }
        
        if (targetCustomers.length === 0) {
            return res.status(400).json({ error: "No valid subscribed customers found for this filter/email." });
        }

        const host = req.get('host');
        let emailsSent = 0;

        for (let customer of targetCustomers) {
            const unsubLink = `${req.protocol}://${host}/api/unsubscribe/${customer._id}`;
            const emailTemplate = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <p>Hi ${customer.name},</p>
                    ${messageHtml}
                    <br><hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
                    <p style="font-size:10px; color:#999;">You are receiving this email because you are a customer of PPL Enterprises.</p>
                    <p style="font-size:10px; color:#999;"><a href="${unsubLink}" style="color:#999;">Click here to unsubscribe</a></p>
                </div>
            `;
            
            try {
                await transporter.sendMail({
                    from: '"PPL Offers" <chennakesavarao89@gmail.com>',
                    to: customer.email,
                    subject: subject,
                    html: emailTemplate
                });
                emailsSent++;
            } catch (err) {
                console.error("Failed to send marketing email to:", customer.email, err);
            }
        }
        res.json({ success: true, message: `Email successfully sent to ${emailsSent} customers.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// SALES & CRM MANAGEMENT
// ==========================================
app.get('/api/customers', async (req, res) => {
    try { res.json(await Customer.find().sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', async (req, res) => {
    try { await new Customer(req.body).save(); res.json({ success: true, message: "Customer Added!" }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales-orders', async (req, res) => {
    try { res.json(await SalesOrder.find().sort({ orderDate: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales-orders', async (req, res) => {
    try {
        const { customerId, customerName, items, status, createdBy } = req.body;
        let subtotal = 0; const enrichedItems = []; 

        for (let item of items) {
            subtotal += (item.quantity * item.unitPrice);
            let product = await Product.findOne({ barcode: item.productCode });
            
            if (product) {
                if (status === 'CONFIRMED') {
                    if (product.currentStock < item.quantity) return res.status(400).json({ error: `Not enough stock for ${item.productCode}` });
                    product.reservedStock = (product.reservedStock || 0) + item.quantity; 
                    await product.save();
                }
                enrichedItems.push({
                    ...item,
                    sector: product.sector || 'N/A', grade: product.grade || 'N/A',
                    length: product.length || 0, af: product.af ? String(product.af) : 'N/A',
                    weightPerPc: product.weightPerPc || 0
                });
            } else {
                enrichedItems.push({ ...item, sector: 'N/A', grade: 'N/A', length: 0, af: 'N/A', weightPerPc: 0 });
            }
        }

        const gstAmount = subtotal * 0.18; 
        const grandTotal = subtotal + gstAmount;

        await new SalesOrder({
            orderNo: `SO-${Date.now()}`, customerId, customerName, items: enrichedItems, 
            subtotal, gstAmount, grandTotal, status, createdBy
        }).save();
        
        res.json({ success: true, message: `Order saved as ${status}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sales Order Status Update (WITH PDF & EMAILS)
app.put('/api/sales-orders/:id/status', async (req, res) => {
    try {
        const { status, paymentStatus, username, trackingLink } = req.body;
        const order = await SalesOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: "Order not found" });

        const customer = await Customer.findById(order.customerId);

        // Inventory deduction logic
        if (order.status !== 'DISPATCHED' && status === 'DISPATCHED') {
            for (let item of order.items) {
                let product = await Product.findOne({ barcode: item.productCode });
                if (product) {
                    product.currentStock -= item.quantity;
                    product.reservedStock = Math.max((product.reservedStock || 0) - item.quantity, 0);
                    await product.save();
                    await new Transaction({ barcode: product.barcode, type: 'DISPATCH', quantity: item.quantity, resultingStock: product.currentStock, user: username }).save();
                }
            }
        }

        if (status) order.status = status;
        if (paymentStatus) order.paymentStatus = paymentStatus;
        if (trackingLink) order.trackingLink = trackingLink;
        
        await order.save();

        // Email Dispatch Logic
        if (customer && customer.email && customer.isSubscribed) {
            let mailOptions = {
                from: '"PPL Accounts" <chennakesavarao89@gmail.com>',
                to: customer.email,
                subject: '',
                html: ''
            };

            if (status === 'CONFIRMED') {
                mailOptions.subject = `Order Confirmation & Invoice - ${order.orderNo}`;
                mailOptions.html = `<p>Dear ${customer.name},</p><p>Thank you for your order! Please find your official PDF Invoice attached to this email.</p>`;
                
                // Generate and attach PDF
                const pdfBuffer = await generateInvoicePDF(order, customer);
                mailOptions.attachments = [{
                    filename: `Invoice_${order.orderNo}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }];
            } 
            else if (status === 'DISPATCHED') {
                mailOptions.subject = `Order Dispatched - ${order.orderNo}`;
                mailOptions.html = `<p>Dear ${customer.name},</p><p>Your order <strong>${order.orderNo}</strong> has been packed and dispatched from our facility.</p>`;
            }
            else if (status === 'SHIPPED') {
                mailOptions.subject = `Order Shipped 🚚 - ${order.orderNo}`;
                mailOptions.html = `<p>Dear ${customer.name},</p><p>Your order <strong>${order.orderNo}</strong> is on the way!</p>
                                    <p>Track your consignment using the link below:</p>
                                    <br>
                                    <a href="${trackingLink}" style="background:#007bff; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;">Track Order</a>`;
            }
            else if (status === 'DELIVERED') {
                mailOptions.subject = `Order Delivered ✅ - ${order.orderNo}`;
                mailOptions.html = `<p>Dear ${customer.name},</p><p>Your order <strong>${order.orderNo}</strong> has been delivered. Thank you for doing business with PPL!</p>`;
            }

            if (mailOptions.subject) {
                transporter.sendMail(mailOptions).catch(err => console.log("Email error:", err));
            }
        }

        res.json({ success: true, message: "Order updated successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Temporary Index Fix
SalesOrder.syncIndexes().then(() => console.log("✅ Ghost indexes cleared from Sales Orders!")).catch(err => console.log(err));

// ==========================================
// PPC ROUTING ENGINE
// ==========================================
app.put('/api/ppc/verify/:id', async (req, res) => {
    try {
        const { status, remarks, nextRoute, username } = req.body;
        const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });

        batch.ppcStatus = status; batch.ppcRemarks = remarks; batch.ppcBy = username; batch.ppcDate = new Date();
        if (status === 'APPROVED') { batch.nextProcessRoute = nextRoute; batch.isReadyForNextStage = true; }
        
        await batch.save();
        res.json({ success: true, message: `Batch ${status} and routed to ${nextRoute || 'Hold'}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// QC GATEKEEPER & INVENTORY MOVEMENT
// ==========================================
app.get('/api/qc/pending', async (req, res) => {
    try { res.json(await ProductionBatch.find({ qcStatus: 'PENDING', ppcStatus: 'APPROVED' }).sort({ date: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/qc/history', async (req, res) => {
    try { res.json(await ProductionBatch.find({ qcStatus: { $in: ['APPROVED', 'REJECTED'] } }).sort({ qcDate: -1 }).limit(100)); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/qc/approve/:id', async (req, res) => {
    try {
        const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        if (batch.ppcStatus !== 'APPROVED') return res.status(400).json({ error: "PPC Approval required before QC." });
        if (batch.qcStatus === 'APPROVED' || batch.qcStatus === 'REJECTED') return res.status(400).json({ error: "Batch already processed by QC!" });

        const incomingStatus = req.body.status || 'APPROVED'; 
        const finalAccQty = req.body.accQty !== undefined ? req.body.accQty : batch.acceptedQty;
        const finalRejQty = req.body.rejQty !== undefined ? req.body.rejQty : batch.rejectedQty;
        const finalRejKg  = req.body.rejKg !== undefined ? req.body.rejKg : batch.rejectionKg;

        if (incomingStatus === 'APPROVED') {
            let lookupCode = batch.partNo || batch.productBarcode;
            if (lookupCode) {
                let product = await Product.findOne({ barcode: lookupCode.trim() });
                if (!product) product = new Product({ barcode: lookupCode.trim(), productCode: lookupCode.trim(), currentStock: 0, wipStock: 0 });

                if (batch.nextProcessRoute === 'READY_STOCK' || batch.stage === 'POLISHING' || batch.stage === 'SEC_OP') {
                    product.productionReadied = (product.productionReadied || 0) + finalAccQty;
                    product.wipStock = Math.max((product.wipStock || 0) - (finalAccQty + finalRejQty), 0);
                    await new Transaction({ barcode: product.barcode, type: 'QC_APPROVAL', quantity: finalAccQty, resultingStock: product.currentStock, user: req.body.qcBy || 'QC Inspector' }).save();
                } else if (batch.stage === 'FORGING') {
                    product.wipStock = (product.wipStock || 0) + finalAccQty;
                } else {
                    product.wipStock = Math.max((product.wipStock || 0) - finalRejQty, 0);
                }
                
                product.lastUpdated = new Date();
                await product.save();
            }
        }
        
        batch.acceptedQty = finalAccQty; batch.rejectedQty = finalRejQty; batch.rejectionKg = finalRejKg;
        batch.measuredLength = req.body.measuredLength; batch.measuredAF = req.body.measuredAF; batch.threadGauge = req.body.threadGauge;
        batch.qcStatus = incomingStatus; batch.qcBy = req.body.qcBy || 'QC Inspector'; batch.qcDate = new Date(); batch.qcRemarks = req.body.qcRemarks || '';
        
        await batch.save();
        res.json({ success: true, message: `QC ${incomingStatus} Successfully!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// PRODUCTION DEPT
// ==========================================
app.get('/api/production/batches', async (req, res) => {
    try { res.json(await ProductionBatch.find().sort({ date: -1, _id: -1 }).limit(200)); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/production/batch', async (req, res) => {
    try {
        let lookupCode = req.body.partNo || req.body.productBarcode; 
        if (lookupCode) {
            let product = await Product.findOne({ barcode: lookupCode.trim() });
            if (!product) product = new Product({ barcode: lookupCode.trim(), productCode: lookupCode.trim(), currentStock: 0, wipStock: 0 });

            if (req.body.stage === 'FORGING' && req.body.rawMaterialCode && req.body.rawMaterialConsumedKg) {
                const material = await RawMaterial.findOne({ materialCode: req.body.rawMaterialCode.trim().toUpperCase() });
                if (material) {
                    material.currentStockKg -= Number(req.body.rawMaterialConsumedKg);
                    material.lastUpdate = new Date();
                    await material.save();
                }
            } 
            product.lastUpdated = new Date(); 
            await product.save();
        }

        await new ProductionBatch({
            ...req.body,
            batchNumber: req.body.batchNumber || `BATCH-${Date.now()}`,
            date: req.body.date ? new Date(req.body.date) : new Date(),
            ppcStatus: 'PENDING', qcStatus: 'PENDING'
        }).save();
        res.json({ success: true, message: `Production Logged!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/production/batch/:id', async (req, res) => {
    try {
        await ProductionBatch.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Batch deleted successfully" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==========================================
// INVENTORY & TRANSACTIONS
// ==========================================
app.get('/api/product/:barcode', async (req, res) => {
    try {
        const product = await Product.findOne({ barcode: req.params.barcode.trim() });
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/products', async (req, res) => {
    try { res.json(await Product.find().sort({ lastUpdated: -1, _id: -1 })); } 
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const barcode = req.body.productCode.trim();
        if (await Product.findOne({ barcode })) return res.status(400).json({ success: false, message: "Code exists!" });

        const newProduct = new Product({ ...req.body, barcode, productCode: barcode, wipStock: 0, productionReadied: 0, fgCheck: 0 });
        await newProduct.save();

        if (req.body.currentStock > 0) {
            await new Transaction({ barcode, type: 'INWARD', quantity: req.body.currentStock, resultingStock: req.body.currentStock, user: "Admin" }).save();
        }
        res.json({ success: true, message: "Product Added!" });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try { res.status(200).json(await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { new: true })); } 
    catch (error) { res.status(500).json({ message: error.message }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try { await Product.findByIdAndDelete(req.params.id); res.status(200).json({ message: "Deleted" }); } 
    catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try { res.json(await Transaction.find().sort({ date: -1, _id: -1 }).limit(100)); } 
    catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// MOBILE APP SCANNER ENDPOINT (FG-CHECK)
// ==========================================
app.post('/api/stock', async (req, res) => {
    try {
        const { barcode, type, quantity, username } = req.body;
        if (!barcode || !quantity) return res.status(400).json({ error: "Missing data" });

        let product = await Product.findOne({ barcode });
        if (!product) return res.status(404).json({ error: "Product not found" });

        const parsedQty = Number(quantity);

        if (type === 'INWARD') {
            product.fgCheck = (product.fgCheck || 0) + parsedQty;
            product.currentStock = (product.currentStock || 0) + parsedQty;
        } else if (type === 'DISPATCH') {
            product.currentStock = Math.max((product.currentStock || 0) - parsedQty, 0);
        }

        product.lastUpdated = new Date();
        await product.save();

        await new Transaction({ barcode: product.barcode, type: type, quantity: parsedQty, resultingStock: product.currentStock, user: username || 'App Scanner' }).save();
        res.json({ success: true, newStock: product.currentStock });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// PURCHASE & RAW MATERIALS
// ==========================================
app.get('/api/raw-materials', async (req, res) => {
    try { res.json(await RawMaterial.find().sort({ lastUpdate: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    try {
        const { materialCode, materialName, grade, supplier, scope, addedKg, username } = req.body;
        let material = await RawMaterial.findOne({ materialCode });
        
        if (!material) {
            material = new RawMaterial({ materialCode, materialName: materialName || "Carbon Steel", grade, lastSupplier: supplier, scope, currentStockKg: addedKg, lastUpdatedBy: username || 'Purchase Dept', lastUpdate: new Date() });
        } else {
            material.currentStockKg += Number(addedKg);
            if (grade) material.grade = grade;               
            if (supplier) material.lastSupplier = supplier;  
            if (scope) material.scope = scope;               
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            if (materialName && materialName.trim() !== "") material.materialName = materialName.trim();
        }
        await material.save();
        await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username || 'Purchase Dept' }).save();
        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/purchase-orders', async (req, res) => {
    try { res.json(await PurchaseOrder.find().sort({ orderDate: -1, _id: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/purchase-orders', async (req, res) => {
    try {
        const { supplierName, materialCode, grade, scope, expectedKg, costPerKg, username } = req.body;
        await new PurchaseOrder({ poNumber: `PO-${Date.now()}`, supplierName, materialCode: materialCode.toUpperCase(), grade: grade || "Standard", scope: scope || "General Inventory", expectedKg: Number(expectedKg), costPerKg: Number(costPerKg), totalCost: Number(expectedKg) * Number(costPerKg), orderedBy: username || "Purchase Dept" }).save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    try {
        const { username } = req.body;
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid PO" });

        po.status = 'RECEIVED'; po.receivedDate = new Date(); await po.save();

        let material = await RawMaterial.findOne({ materialCode: po.materialCode });
        if (!material) {
            material = new RawMaterial({ materialCode: po.materialCode, materialName: "Steel Stock", grade: po.grade, lastSupplier: po.supplierName, currentStockKg: po.expectedKg, lastUpdatedBy: username || "Purchase Dept", lastUpdate: new Date() });
        } else {
            material.currentStockKg += po.expectedKg; material.grade = po.grade; material.lastSupplier = po.supplierName; material.lastUpdatedBy = username || "Purchase Dept"; material.lastUpdate = new Date();
        }
        await material.save();

        await new Transaction({ barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" }).save();
        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// WORK ORDERS (WO) MANAGEMENT
// ==========================================
app.get('/api/work-orders/active', async (req, res) => {
    try { res.json(await WorkOrder.find({ status: 'ACTIVE' }).sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/work-orders', async (req, res) => {
    try { await new WorkOrder(req.body).save(); res.json({ success: true, message: "Work Order Created!" }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// SERVER LISTEN
// ==========================================
app.listen(process.env.PORT || 5000, () => console.log(`🚀 ERP Server Running on port ${process.env.PORT || 5000}`));