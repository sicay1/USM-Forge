/* Vietnamese source strings are stable keys; missing translations fall back safely. */
(() => {
  const en = {
    'Đang tải khung hình…': 'Loading frame…',
    'Không tải được khung hình. Hãy thử tua lại.': 'Could not load the frame. Please try seeking again.',
    'Đang kết nối…': 'Connecting…', '＋ Tải video lên': '＋ Upload video',
    'Dự án': 'Projects', 'Dự án ▾': 'Project ▾', 'Tiến độ video': 'Video progress',
    'Tiến độ xử lý': 'Processing progress', 'Đang xử lý…': 'Processing…',
    'Từ video đến USM.': 'From video to USM.',
    'Chọn khung hình. Đặt A/B. Hoàn thiện vòng lặp.': 'Choose a frame. Set A/B. Perfect your loop.',
    '↓ Lưu dự án': '↓ Save project', 'Mở dự án .json': 'Open project .json',
    'Nhập A/B .txt': 'Import A/B .txt', '↓ Tải A/B .txt': '↓ Download A/B .txt',
    'Xóa dự án': 'Delete project', 'Video của bạn. Vòng lặp của bạn.': 'Your video. Your loop.',
    'Kéo video vào đây, hoặc chọn từ máy.': 'Drop a video here, or choose a file.',
    '＋ Chọn video': '＋ Choose video', 'XEM TRƯỚC': 'PREVIEW',
    'TOÀN BỘ VIDEO': 'WHOLE VIDEO', 'Khung hình đang chọn': 'Selected frame',
    'Đang chuẩn bị video…': 'Preparing video…', 'Frame trước (←)': 'Previous frame (←)',
    'Frame trước': 'Previous frame', 'Frame tiếp (→)': 'Next frame (→)', 'Frame tiếp': 'Next frame',
    'Phát / dừng (Space)': 'Play / pause (Space)', 'Phát / dừng': 'Play / pause',
    'Chế độ phát': 'Playback mode', '↻ Lặp A–B': '↻ Loop A–B', 'Intro → loop': 'Intro → loop',
    'Xem đoạn nối': 'Preview seam', 'Ghép cuối B với đầu A để kiểm tra mối nối': 'Join the end at B to the start at A to inspect the seam',
    'Toàn bộ': 'Whole video', 'Toàn màn hình': 'Fullscreen',
    'Các khung hình trên timeline': 'Timeline thumbnails', 'Vị trí video': 'Video position',
    'Mốc A': 'Marker A', 'Mốc B': 'Marker B', 'Đặt A': 'Set A', 'Đặt B': 'Set B',
    'Đến A': 'Go to A', 'Đến B': 'Go to B', 'Đặt A tại frame đang xem': 'Set A to the current frame',
    'Đặt B tại frame đang xem': 'Set B to the current frame',
    'B là ranh giới kết thúc; cuối video hiển thị frame cuối': 'B is an end boundary; at video end, show the last frame',
    'Lưu A/B': 'Save A/B', 'Đã lưu': 'Saved', 'Có thay đổi chưa lưu': 'Unsaved changes',
    'CẤU HÌNH XUẤT': 'EXPORT SETTINGS', 'Độ phân giải': 'Resolution', 'Tùy chỉnh': 'Custom',
    'Rộng': 'Width', 'Cao': 'Height', 'Tốc độ khung hình': 'Frame rate',
    'Áp dụng & tạo lại preview': 'Apply & rebuild preview',
    'Giữ tỷ lệ ảnh. A/B được quy đổi theo thời gian khi đổi FPS.': 'Preserve aspect ratio. A/B follow their timestamps when FPS changes.',
    'Giữ âm thanh': 'Keep audio', '↗ Xuất file USM': '↗ Export USM', 'Thông tin xuất': 'Export details',
    'Xuất từ bản chuẩn hóa đầy đủ chất lượng. Hành vi cue trong game phụ thuộc client.': 'Export from the full-quality normalized master. In-game cue behavior depends on the client.',
    'Bản xuất đã sẵn sàng': 'Export is ready', 'Đang chuẩn bị': 'Preparing',
    '{width} × {height} · {codec} · {size} MB · Có âm thanh': '{width} × {height} · {codec} · {size} MB · Audio',
    '{width} × {height} · {codec} · {size} MB · Không âm thanh': '{width} × {height} · {codec} · {size} MB · No audio',
    'Đang đọc thông tin video…': 'Reading video information…',
    'Âm thanh stereo 48 kHz khi xuất USM.': 'Stereo 48 kHz audio in the USM export.',
    'Video nguồn không có âm thanh.': 'The source video has no audio.',
    'FRAME {frame}': 'FRAME {frame}', '{frames} frames · {fps} fps': '{frames} frames · {fps} fps',
    'Loop A → B · {time}': 'Loop A → B · {time}',
    'Không lặp · Đưa cả A và B vào trong video để bật loop': 'No loop · Move both A and B inside the video to enable looping',
    'Frame {frame}, {time}': 'Frame {frame}, {time}',
    '{name} · frame {frame} · {time}': '{name} · frame {frame} · {time}',
    '{size} MB · {width} × {height} · {frames} frames · Đã kiểm tra giải mã': '{size} MB · {width} × {height} · {frames} frames · Decode verified',
    '↓ Tải USM': '↓ Download USM', 'Cue points': 'Cue points', 'Kiểm tra': 'Verification',
    'LẶP A → B': 'LOOP A → B', 'INTRO → LOOP': 'INTRO → LOOP', 'TỪNG FRAME': 'FRAME BY FRAME',
    'ĐOẠN NỐI B → A': 'SEAM B → A',
    'Cue point chưa được lưu. Chuyển dự án và bỏ các thay đổi này?': 'A/B changes are unsaved. Switch projects and discard them?',
    'Cue point chưa lưu. Tiếp tục tải video mới?': 'A/B changes are unsaved. Continue uploading a new video?',
    'Mất kết nối tạm thời, đang thử lại…': 'Connection interrupted. Retrying…',
    'Đoạn nối sẵn sàng. Bấm phát để xem.': 'Seam preview is ready. Press play to watch.',
    'File USM đã sẵn sàng để tải xuống.': 'Your USM file is ready to download.',
    'File tối đa {max} MB.': 'Maximum file size: {max} MB.',
    'Đang tải video lên': 'Uploading video', 'Upload thất bại': 'Upload failed',
    'Máy chủ trả về dữ liệu không hợp lệ.': 'The server returned invalid data.',
    'Upload thất bại. Kiểm tra kết nối hoặc dung lượng file.': 'Upload failed. Check your connection or file size.',
    'Đưa cả A và B vào trong video để bật loop.': 'Move both A and B inside the video to enable looping.',
    'Chọn A trước B để phát vòng lặp.': 'Place A before B to play a loop.',
    'Không phát được preview. Thử tạo lại preview.': 'Cannot play the preview. Try rebuilding it.',
    'Đã lưu cue point.': 'A/B saved.',
    'Hãy áp dụng kích thước/FPS mới trước khi lưu dự án.': 'Apply the new size/FPS before saving the project.',
    'Xóa bản video đã upload, preview và các bản xuất của dự án này? File nguồn trên máy bạn không bị ảnh hưởng.': 'Delete this project’s uploaded video, previews and exports? Your original local file will not be affected.',
    'Đã xóa dự án.': 'Project deleted.', 'Đã nhập hai cue point A/B.': 'A/B cues imported.',
    'Đã khôi phục cấu hình và cue point.': 'Settings and A/B restored.',
    'Bấm “Áp dụng & tạo lại preview” để dùng kích thước hoặc FPS mới trước khi xuất.': 'Click “Apply & rebuild preview” to use the new size or FPS before exporting.',
    'Chưa kết nối encoder': 'Encoder disconnected', 'Native USM · Sẵn sàng': 'Native USM · Ready',
    'Encoder đã kết nối': 'Encoder connected',
    'MP4 · WEBM · MOV · MKV · AVI · USM · Tối đa {max} MB / 10 phút': 'MP4 · WEBM · MOV · MKV · AVI · USM · Up to {max} MB / 10 minutes',
    'Ngân sách đóng gói: {max} MB. Video dài có thể cần giảm bitrate.': 'Muxing budget: {max} MB. Longer videos may need a lower bitrate.',
    'Đọc thông tin video': 'Reading video information', 'Chuẩn hóa video': 'Normalizing video',
    'Tạo video xem trước': 'Building preview', 'Tạo timeline': 'Building timeline',
    'Đang chờ xử lý': 'Queued', 'Hoàn tất': 'Complete', 'Không hoàn tất': 'Failed',
    'Bị gián đoạn do máy chủ khởi động lại': 'Interrupted by server restart', 'Hãy chạy lại thao tác.': 'Please retry the operation.',
    'Ghép đoạn nối B → A': 'Rendering seam B → A', 'Tạo AVI cho encoder': 'Preparing AVI for encoder',
    'Mã hóa USM': 'Encoding USM', 'Kiểm tra file USM': 'Verifying USM',
    'Mã hóa MPEG-1 trên Linux': 'Encoding MPEG-1 on Linux', 'Mã hóa MPEG-1': 'Encoding MPEG-1',
    'Mã hóa âm thanh ADX': 'Encoding ADX audio', 'Đóng gói USM': 'Muxing USM',
    'Nhúng cue point và kiểm tra vị trí tua': 'Embedding cues and verifying seek positions',
    'Kiểm tra giải mã video và âm thanh': 'Verifying video and audio decoding',
    'Yêu cầu thất bại.': 'Request failed.', 'Lỗi máy chủ.': 'Server error.',
    'Không tìm thấy dự án.': 'Project not found.', 'Dự án đang xử lý, vui lòng đợi.': 'Project is processing. Please wait.',
    'Video chưa sẵn sàng.': 'Video is not ready.', 'Dữ liệu yêu cầu quá lớn.': 'Request data is too large.',
    'JSON không hợp lệ.': 'Invalid JSON.', 'Không tìm thấy file.': 'File not found.',
    'File chưa tồn tại.': 'File does not exist yet.', 'Không tìm thấy.': 'Not found.',
    'File vượt giới hạn dung lượng.': 'File exceeds the size limit.', 'Hàng đợi đầy, hãy thử lại sau.': 'The queue is full. Please try again later.',
    'File rỗng.': 'Empty file.', 'Đợi tải frame xong rồi xóa dự án.': 'Wait for frame loading to finish before deleting the project.',
    'Video nguồn chưa được đọc thành công. Hãy tải lại video.': 'The source video could not be read. Please upload it again.',
    'Video không có âm thanh.': 'The video has no audio.', 'File dự án không được hỗ trợ.': 'Unsupported project file.',
    'Hãy áp dụng cùng kích thước và FPS của dự án đã lưu trước khi nhập.': 'Apply the saved project’s size and FPS before importing.',
    'Frame không hợp lệ.': 'Invalid frame.', 'Đang tải nhiều frame, hãy thử lại.': 'Too many frames are loading. Please retry.',
    'Encoder chưa được cấu hình.': 'Encoder is not configured.', 'Bản xuất chưa hoàn tất.': 'Export is not finished.',
    'Chiều rộng phải là số chẵn từ 64 đến 4094.': 'Width must be an even number from 64 to 4094.',
    'Chiều cao phải là số chẵn từ 64 đến 2160.': 'Height must be an even number from 64 to 2160.',
    'FPS phải là 24, 25, 30, 50 hoặc 60.': 'FPS must be 24, 25, 30, 50 or 60.',
    'Bitrate phải từ 1 đến 40 Mbps.': 'Bitrate must be between 1 and 40 Mbps.',
    'Tối đa 100 cue point.': 'At most 100 cue points.', 'Cue point không hợp lệ.': 'Invalid cue point.',
    'Tên cue dùng 1–64 ký tự: chữ Latin, số, dấu _, - hoặc .': 'Cue names must use 1–64 Latin letters, digits, _, - or .',
    'Tên cue point không được trùng nhau.': 'Cue names must be unique.',
    'Cue ID phải là số nguyên từ 0 đến 65535.': 'Cue ID must be an integer from 0 to 65535.',
    'Cue point nằm ngoài video.': 'Cue point is outside the video.', 'File cue point quá lớn.': 'Cue file is too large.',
    'Dòng đầu phải là số tick mỗi giây.': 'The first line must specify ticks per second.',
    'Mỗi dòng cue phải có đúng: thời_gian,ID,tên. Chưa hỗ trợ trường dữ liệu phụ.': 'Each cue line must contain exactly time,ID,name. Extra fields are not supported.',
    'Thời gian cue không hợp lệ.': 'Invalid cue timestamp.', 'Vòng lặp cần A < B và nằm trong video.': 'The loop requires A < B within the video.',
    'Chỉ hỗ trợ hai cue point A và B.': 'Only two cue points, A and B, are supported.',
    'File không có luồng video đọc được.': 'The file has no readable video stream.',
    'Video cần có thời lượng từ trên 0 đến 600 giây.': 'Video duration must be greater than 0 and no more than 600 seconds.',
    'Kích thước video nguồn không được vượt quá 8192 × 8192.': 'Source dimensions must not exceed 8192 × 8192.',
    'Backend encoder không khả dụng.': 'Encoder backend is unavailable.',
    'Không tìm thấy medianoche.exe. Hãy cấu hình ENCODER_PATH.': 'medianoche.exe not found. Configure ENCODER_PATH.',
    'Bộ mã hóa native chưa sẵn sàng.': 'Native encoder is not ready.',
    'Video mã hóa vượt giới hạn bộ nhớ đóng gói. Hãy giảm bitrate.': 'Encoded video exceeds the muxing memory limit. Lower the bitrate.'
  };
  let language = 'vi';
  try { if (localStorage.getItem('usm-language') === 'en') language = 'en'; } catch { /* Storage may be disabled. */ }
  const bindings = new WeakMap();
  function t(source, params = {}) {
    const template = language === 'en' ? en[source] ?? source : source;
    return template.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match));
  }
  function text(id, source, params = {}) {
    const element = typeof id === 'string' ? document.getElementById(id) : id;
    element.dataset.i18n = source; bindings.set(element, params); element.textContent = t(source, params);
  }
  function apply() {
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n, bindings.get(element));
    for (const attr of ['title','aria-label','alt']) for (const element of document.querySelectorAll(`[data-i18n-${attr}]`)) element.setAttribute(attr, t(element.getAttribute(`data-i18n-${attr}`)));
    const button = document.getElementById('languageToggle');
    button.textContent = language === 'vi' ? 'English' : 'Tiếng Việt';
    button.setAttribute('aria-label', language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt');
  }
  function setLanguage(value) {
    language = value === 'en' ? 'en' : 'vi';
    try { localStorage.setItem('usm-language', language); } catch { /* Keep working without persistence. */ }
    apply();
  }
  window.USMI18n = { t, text, apply, setLanguage, get language() { return language; }, has: key => Object.hasOwn(en, key) };
})();
