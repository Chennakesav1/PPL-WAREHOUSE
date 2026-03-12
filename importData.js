const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
require('dotenv').config();
const { Product } = require('./models');

function getActualValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return "";
    if (typeof cell.value === 'object') {
        return cell.value.result !== undefined ? cell.value.result : 0;
    }
    return cell.value;
}

function getNumberValue(cell) {
    let val = getActualValue(cell);
    let num = Number(val);
    return isNaN(num) ? 0 : num;
}

function getStringValue(cell) {
    let val = getActualValue(cell);
    return String(val).trim();
}

async function runImport() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to database. Reading Excel file...");

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('inventory.xlsx'); 
        const sheet = workbook.getWorksheet(1);
        const productsToSave = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; 

            let scanCode = getStringValue(row.getCell(2)); 

            if (scanCode && scanCode !== "0" && scanCode !== "") {
                scanCode = scanCode.replace(/\*/g, '').trim();

                productsToSave.push({
                    updateOne: {
                        filter: { barcode: scanCode },
                        update: {
                            $set: {
                                barcode: scanCode, 
                                productCode: getStringValue(row.getCell(2)), 
                                sector: getStringValue(row.getCell(3)),      
                                type: getStringValue(row.getCell(4)),
                                Group: getStringValue(row.getCell(5)),
                                length: getNumberValue(row.getCell(6)),
                                af: getNumberValue(row.getCell(7)),
                                grade: getStringValue(row.getCell(8)),
                                weightPerPc: getNumberValue(row.getCell(9)),
                                perboxquantity: getNumberValue(row.getCell(10)),
                                Numofboxes: getNumberValue(row.getCell(11)),
                                currentStock: getNumberValue(row.getCell(15))
                            }
                        },
                        upsert: true
                    }
                });
            }
        });

        if (productsToSave.length > 0) {
            await Product.bulkWrite(productsToSave);
            console.log(`Success! Imported ${productsToSave.length} products perfectly.`);
        } else {
            console.log("No valid products found.");
        }
        process.exit();
    } catch (error) {
        console.error("Something went wrong:", error);
        process.exit(1);
    }
}
runImport();