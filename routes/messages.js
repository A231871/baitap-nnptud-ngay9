var express = require("express");
var router = express.Router();
let mongoose = require('mongoose');
let messageModel = require('../schemas/messages');
const { CheckLogin } = require("../utils/authHandler");
const { uploadImage } = require('../utils/uploadHandler'); // Import hàm upload đã có

// 1. GET "/" - Lấy message cuối cùng của mỗi cuộc hội thoại
router.get('/', CheckLogin, async function (req, res, next) {
    try {
        let myId = req.user._id;

        // Sử dụng Aggregation của MongoDB để gom nhóm cực nhanh
        let latestMessages = await messageModel.aggregate([
            // B1: Tìm tất cả tin nhắn mình gửi hoặc nhận
            { 
                $match: { 
                    $or: [{ from: myId }, { to: myId }],
                    isDeleted: false
                } 
            },
            // B2: Sắp xếp theo thời gian mới nhất giảm dần
            { $sort: { createdAt: -1 } },
            // B3: Gom nhóm theo người chat cùng mình
            {
                $group: {
                    _id: {
                        // Nếu mình là người gửi (from), thì gom nhóm theo người nhận (to). Ngược lại.
                        $cond:[{ $eq: ["$from", myId] }, "$to", "$from"]
                    },
                    lastMessage: { $first: "$$ROOT" } // Lấy tin nhắn đầu tiên (mới nhất) của nhóm
                }
            },
            // B4: Sắp xếp lại danh sách cuối cùng theo thời gian mới nhất
            { $sort: { "lastMessage.createdAt": -1 } }
        ]);

        // (Tùy chọn) Populate thêm thông tin người đang chat cùng mình cho đẹp
        await messageModel.populate(latestMessages, { path: '_id', select: 'username avatarUrl', model: 'user' });

        res.send(latestMessages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// 2. GET "/:userID" - Lấy toàn bộ lịch sử tin nhắn giữa 2 người
router.get('/:userID', CheckLogin, async function (req, res, next) {
    try {
        let myId = req.user._id;
        let partnerId = req.params.userID;

        let messages = await messageModel.find({
            isDeleted: false,
            $or:[
                { from: myId, to: partnerId }, // Mình gửi cho họ
                { from: partnerId, to: myId }  // Họ gửi cho mình
            ]
        })
        .sort({ createdAt: 1 }) // Sắp xếp tăng dần (từ cũ tới mới như giao diện chat)
        .populate('from', 'username avatarUrl')
        .populate('to', 'username avatarUrl');

        res.send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// 3. POST "/" - Gửi tin nhắn (Text hoặc File)
// Sử dụng uploadImage.single('file') để bắt file đính kèm
router.post('/', CheckLogin, uploadImage.single('file'), async function (req, res, next) {
    try {
        let myId = req.user._id;
        let toUserId = req.body.to; // ID người nhận gửi từ form

        if (!toUserId) {
            return res.status(400).send({ message: "Thiếu ID người nhận (to)" });
        }

        let msgType = 'text';
        let msgText = '';

        // Kiểm tra xem có file đính kèm không
        if (req.file) {
            msgType = 'file';
            msgText = req.file.path; // Lưu đường dẫn file
        } else if (req.body.text) {
            msgType = 'text';
            msgText = req.body.text; // Lưu nội dung text
        } else {
            return res.status(400).send({ message: "Phải có nội dung text hoặc file" });
        }

        let newMessage = new messageModel({
            from: myId,
            to: toUserId,
            messageContent: {
                type: msgType,
                text: msgText
            }
        });

        await newMessage.save();
        res.send(newMessage);

    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;