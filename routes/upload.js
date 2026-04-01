var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories')
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')
const crypto = require('crypto');
const userModel = require('../schemas/users');
const roleModel = require('../schemas/roles');
const { sendPasswordEmail } = require('../utils/mailHandler');

// API để upload user từ file Excel
router.post('/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(400).send({ message: "Vui lòng đính kèm file Excel" });
    }

    try {
        let workbook = new exceljs.Workbook();
        let pathFile = path.join(__dirname, '../uploads', req.file.filename);
        await workbook.xlsx.readFile(pathFile);
        
        // Lấy sheet đầu tiên
        let worksheet = workbook.worksheets[0];
        
        // Tìm role ID. Theo data2.js của bạn, role user có tên là "Người dùng" hoặc "user"
        let userRole = await roleModel.findOne({ 
            name: { $in:['user', 'User', 'Người dùng'] }, 
            isDeleted: false 
        });

        if (!userRole) {
            return res.status(400).send({ message: "Không tìm thấy role 'user' trong database" });
        }

        let result = [];
        let errors =[];

        // Lặp qua từng dòng, giả sử Dòng 1 là tiêu đề (Header). 
        // Cột 1: username, Cột 2: email
        for (let row = 2; row <= worksheet.rowCount; row++) {
            let contentRow = worksheet.getRow(row);
            let username = contentRow.getCell(1).value?.toString().trim();
            let email = contentRow.getCell(2).value?.toString().trim();

            if (!username || !email) continue;

            // Kiểm tra user/email đã tồn tại chưa
            let isExist = await userModel.findOne({ $or: [{ username }, { email }] });
            if (isExist) {
                errors.push(`Dòng ${row}: Username hoặc Email đã tồn tại.`);
                continue;
            }

            // Tạo mật khẩu ngẫu nhiên 16 ký tự (crypto hex sinh ra 2 ký tự cho mỗi byte)
            let rawPassword = crypto.randomBytes(8).toString('hex'); 

            try {
                // Tạo user mới
                let newUser = new userModel({
                    username: username,
                    email: email,
                    password: rawPassword,
                    role: userRole._id,
                    status: true
                });

                await newUser.save();

                // Gửi email báo mật khẩu
                await sendPasswordEmail(email, username, rawPassword);

                result.push({
                    username,
                    email,
                    status: "Thành công - Đã gửi email"
                });

            } catch (err) {
                errors.push(`Dòng ${row}: Lỗi khi lưu hoặc gửi email - ${err.message}`);
            }
        }

        res.send({
            message: "Đã xử lý xong file import",
            successCount: result.length,
            errorsCount: errors.length,
            success: result,
            errors: errors
        });

    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];
    let categories = await categoryModel.find({});
    let categoryMap = new Map()
    for (const category of categories) {
        categoryMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title)
    let getSku = products.map(p => p.sku)
    let result = [];
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let errorsInRow = [];
        const contentRow = worksheet.getRow(row);
        let sku = contentRow.getCell(1).value;
        let title = contentRow.getCell(2).value;
        let category = contentRow.getCell(3).value;
        let price = Number.parseInt(contentRow.getCell(4).value);
        let stock = Number.parseInt(contentRow.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            errorsInRow.push("price pahi la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            errorsInRow.push("stock pahi la so duong")
        }
        if (!categoryMap.has(category)) {
            errorsInRow.push("category khong hop le")
        }
        if (getTitle.includes(title)) {
            errorsInRow.push("Title da ton tai")
        }
        if (getSku.includes(sku)) {
            errorsInRow.push("sku da ton tai")
        }
        if (errorsInRow.length > 0) {
            result.push(errorsInRow)
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productModel({
                sku: sku,
                title: title,
                slug: slugify(title,
                    {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        trim: true
                    }
                ), price: price,
                description: title,
                category: categoryMap.get(category)
            })
            await newProduct.save({ session });

            let newInventory = new inventoryModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session });
            await newInventory.populate('product')
            await session.commitTransaction()
            await session.endSession()
            getTitle.push(newProduct.title)
            getSku.push(newProduct.sku)
            result.push(newInventory)
        } catch (error) {
            await session.abortTransaction()
            await session.endSession()
            res.push(error.message)
        }

    }
    res.send(result)
})

module.exports = router