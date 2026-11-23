# Lô Tô Hội Bạn

Game lô tô online bằng HTML, CSS và JavaScript. Cùng một phòng có từ 2 đến 8 người trên các máy khác nhau. Frontend và API triển khai chung lên Vercel. API dùng Upstash Redis để các thiết bị đọc cùng một trạng thái phòng.

## Đưa lên Vercel

1. Giải nén ZIP. Tạo repo GitHub và đẩy toàn bộ nội dung thư mục `loto-online` lên repo, bao gồm `vercel.json`, `api/`, `lib/` và `public/`.
2. Tạo một Redis database trên [Upstash Console](https://console.upstash.com/). Trong phần kết nối **REST**, lấy URL và token có quyền ghi.
3. Trên Vercel, chọn **Add New → Project**, rồi import repo. Chọn **Other** nếu Vercel hỏi Framework Preset. Nếu repo chứa thư mục `loto-online`, đặt **Root Directory** là `loto-online`. Project đã khai báo thư mục xuất bản `public` trong `vercel.json`.
4. Trong **Environment Variables**, thêm `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` vào môi trường **Production** trước khi deploy. Nếu thêm sau khi deploy, hãy redeploy. Giữ token trong biến môi trường của Vercel.
5. Mở URL **Production** của Vercel. Nhập tên, tạo phòng rồi sao chép link mời. Mở link từ máy thứ hai, nhập tên và vào phòng. Khi danh sách có 2 người trở lên, chủ phòng có thể bắt đầu.

Tài liệu [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration) · [Biến môi trường Vercel](https://vercel.com/docs/environment-variables) · [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi)

## Chạy thử trên máy

Cần Node.js 22 trở lên. Trong thư mục project, chạy `npm run dev` và mở [localhost:3000](http://localhost:3000). Dùng hai phiên trình duyệt riêng, ví dụ một cửa sổ thường và một cửa sổ ẩn danh. Chế độ này mặc định lưu phòng trong RAM. Muốn dùng Redis khi chạy local, tạo `.env` từ `.env.example` rồi chạy `node --env-file=.env dev.mjs`.

## Cách chơi

- Mỗi người được phát hai trang vé vuông. Mỗi trang có 3 khung, mỗi khung 3 hàng và mỗi hàng 5 số. Bộ hai trang chứa đủ 90 số, mỗi số xuất hiện một lần.
- Chủ phòng bấm **Bóc số** để lấy ngẫu nhiên một số từ 1 đến 90. Mỗi số chỉ xuất hiện một lần. Các máy đồng bộ khoảng mỗi 2,2 giây.
- Bấm vào ô có số đã bốc trên vé để đánh dấu. Bấm lại để bỏ dấu. Khi đánh dấu đủ 5 số trên một hàng, bấm **Kinh!**. Người gửi yêu cầu hợp lệ đầu tiên thắng ván.
- Chủ phòng có thể mở ván mới sau khi có người thắng. Người mới vào được giữa các ván.
- Tải lại cùng tab sẽ giữ phiên. Khi muốn thoát, dùng **Rời phòng** để nhường chỗ. Nếu chủ phòng rời bằng nút đó, quyền chủ phòng chuyển cho người tiếp theo. Đóng tab vẫn giữ chỗ trong phòng. Phòng trên Vercel hết hạn sau 24 giờ kể từ lần cập nhật trạng thái cuối cùng.
