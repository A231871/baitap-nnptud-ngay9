const nodemailer = require('nodemailer');

// Cấu hình kết nối Mailtrap
const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "48df06967e671a", // Lấy trong Mailtrap -> Inboxes -> SMTP Settings
        pass: "11f2eda536bfec"  // Lấy trong Mailtrap -> Inboxes -> SMTP Settings
    }
});

module.exports = {
    sendPasswordEmail: async function (email, username, password) {
        try {
            const mailOptions = {
                from: '"Hệ thống Admin" <admin@example.com>',
                to: email,
                subject: 'Thông tin tài khoản mới của bạn',
                text: `Xin chào ${username},\n\nTài khoản của bạn đã được tạo thành công trên hệ thống.\n\nThông tin đăng nhập:\n- Username: ${username}\n- Mật khẩu: ${password}\n\nVui lòng bảo mật thông tin này.\n\nTrân trọng,\nAdmin`
            };
            
            let info = await transporter.sendMail(mailOptions);
            return info;
        } catch (error) {
            console.log("Lỗi gửi mail: ", error);
            throw error;
        }
    }
}