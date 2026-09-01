/**
 * Thực thi hộ Next cái redirect mà nó không tự thực thi nổi.
 *
 * BỐI CẢNH (đo trên production 01/09, xem thêm src/middleware.ts): khi
 * redirect() chạy SAU lúc vỏ trang đã đẩy đi, Next không trả 307 được nữa nên
 * nhét vào <head>:
 *
 *     <meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/login">
 *
 * Trình duyệt lẽ ra chờ 1 giây rồi chuyển trang. Nhưng React 19 hydrate <head>
 * và GỠ thẻ đó ra trước khi 1 giây trôi qua, nên chuyến đi không bao giờ khởi
 * hành. Kiểm chứng bằng JS trên trang đang treo: thẻ meta có trong HTML server
 * gửi xuống, nhưng `document.getElementById("__next-page-redirect")` trả null.
 *
 * Script này chạy NGAY lúc trình duyệt đọc tới nó — trước khi React kịp vào
 * cuộc — nên nó thắng cuộc đua. Phải là <script> thô nhúng thẳng, KHÔNG dùng
 * useEffect: React không hydrate nội dung fallback của Suspense, mọi hook đặt
 * ở đây đều câm (chính LoadingScreen đã phải học điều này bằng khối
 * .recovery-static).
 *
 * MutationObserver là cho trường hợp trang render chậm: lúc đó fallback đẩy
 * xuống trước, thẻ meta mới tới sau — quét một lần lúc đầu sẽ hụt.
 *
 * Chỉ nhận đường dẫn nội bộ bắt đầu bằng một dấu "/": không có ai chèn được
 * thẻ này ngoài Next, nhưng một hàm "đọc rồi nhảy tới đó" thì phải tự khoá
 * mình lại — mở cho URL tuyệt đối là mở luôn đường chuyển hướng ra ngoài.
 *
 * NHỚ KIỂM khi nâng cấp Next: id `__next-page-redirect` là nội bộ của Next.
 * Nó đổi tên thì lớp này im lặng ngừng tác dụng — không vỡ gì, chỉ là quay về
 * đúng lỗi treo cũ cho vài đường hiếm mà middleware không gác.
 */
const RESCUE = `(function(){
try{
var done=false;
function jump(m){
  if(done) return true;
  var c=m.getAttribute("content")||"";
  var i=c.toLowerCase().indexOf("url=");
  if(i<0) return false;
  var u=c.slice(i+4).trim().replace(/^["']|["']$/g,"");
  if(u.charAt(0)!=="/"||u.charAt(1)==="/") return false;
  done=true;
  location.replace(u);
  return true;
}
function scan(){
  var m=document.getElementById("__next-page-redirect");
  return m?jump(m):false;
}
if(scan()) return;
var obs=new MutationObserver(function(){ if(scan()) obs.disconnect(); });
obs.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(function(){ obs.disconnect(); },30000);
}catch(e){}
})();`;

export function RedirectRescue() {
  return <script dangerouslySetInnerHTML={{ __html: RESCUE }} />;
}
