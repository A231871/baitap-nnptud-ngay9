const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    messageContent: {
        type: {
            type: String,
            enum: ['file', 'text'], // Ràng buộc chỉ nhận 1 trong 2 giá trị
            required: true
        },
        text: {
            type: String,
            required: true // Nếu là file thì lưu path, nếu là text thì lưu nội dung
        }
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // Bắt buộc phải có để biết tin nhắn nào là cuối cùng
});

module.exports = mongoose.model('message', messageSchema);