/* ============================================
   FORM STYLES - GIA PHẢ NAM VIỆT (v2.3)
   - 2 tầng: Xem + Sửa
   - Màu nút: #5c40d9 (chính) + #2d5dac (phụ)
   ============================================ */

/* ===== OVERLAY ===== */
.form-modal {
  position: fixed !important;
  inset: 0 !important;
  background: rgba(1, 40, 94, 0.75) !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 9999 !important;
  padding: 20px !important;
  overflow-y: auto !important;
  margin: 0 !important;
}

.form-modal.is-visible {
  display: flex !important;
}

.form-modal:not(.is-visible) {
  display: none !important;
}

.form-modal__content {
  background: #FAF8F0;
  border-radius: 14px;
  width: 100%;
  max-width: 720px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(1, 40, 94, 0.4);
  border: 2px solid #B8CCE8;
  animation: modalFadeIn 0.3s ease;
  position: relative;
  z-index: 10000;
}

.form-modal--small .form-modal__content {
  max-width: 520px;
}

@keyframes modalFadeIn {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== HEADER ===== */
.form-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  background: #D4E0F0;
  border-bottom: 2px solid #B8CCE8;
  border-radius: 12px 12px 0 0;
}

.form-modal__title {
  font-family: 'Noto Serif', serif;
  font-size: 18px;
  font-weight: 700;
  color: #01285E;
  margin: 0;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.form-modal__close {
  background: transparent;
  border: none;
  font-size: 26px;
  color: #01285E;
  cursor: pointer;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.form-modal__close:hover {
  background: rgba(1, 40, 94, 0.1);
}

/* ===== BODY ===== */
.form-modal__body {
  padding: 20px 22px;
  overflow-y: auto;
  flex: 1;
  background: #FAF8F0;
}

/* ============================================
   TẦNG 1: XEM THÔNG TIN
   ============================================ */
.person-view {
  text-align: center;
  padding: 10px 0;
}

.person-view__avatar {
  width: 140px;
  height: 187px;
  border-radius: 10px;
  border: 2px solid #B8CCE8;
  background: #FFFFFF;
  overflow: hidden;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(1, 40, 94, 0.15);
}

.person-view__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-view__avatar-placeholder {
  font-size: 48px;
  color: #B8CCE8;
}

.person-view__name {
  font-family: 'Noto Serif', serif;
  font-size: 26px;
  font-weight: 700;
  color: #01285E;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 8px 0 4px;
  line-height: 1.3;
}

.person-view__years {
  font-family: 'Noto Serif', serif;
  font-size: 18px;
  font-weight: 700;
  color: #01285E;
  margin-bottom: 20px;
}

.person-view__section {
  margin: 20px 0;
  padding: 16px 0;
  border-top: 1px dashed #B8CCE8;
  text-align: left;
}

.person-view__section:first-of-type {
  border-top: none;
}

.person-view__section-title {
  font-family: 'Noto Serif', serif;
  font-size: 14px;
  font-weight: 700;
  color: #01285E;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin: 0 0 12px 0;
  padding-left: 10px;
  border-left: 4px solid #01285E;
}

.person-view__field {
  margin-bottom: 12px;
}

.person-view__field-label {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #01285E;
  margin-bottom: 4px;
}

.person-view__field-value {
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-style: italic;
  color: #1A2E4A;
  padding: 8px 12px;
  background: #FFFFFF;
  border: 1.5px solid #B8CCE8;
  border-radius: 6px;
  line-height: 1.6;
  min-height: 38px;
}

.person-view__field-value--empty {
  color: #99AACC;
  font-style: italic;
}

.person-view__empty {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-style: italic;
  color: #99AACC;
  padding: 12px;
  text-align: center;
  background: #FFFFFF;
  border: 1px dashed #B8CCE8;
  border-radius: 6px;
}

.person-view__children-note {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-style: italic;
  color: #1A2E4A;
  padding: 14px;
  background: #FFFFFF;
  border: 1.5px solid #B8CCE8;
  border-radius: 6px;
  text-align: center;
  line-height: 1.7;
}

/* ===== NÚT Ở TẦNG 1 ===== */
.person-view__actions {
  display: flex;
  gap: 10px;
  padding: 16px 0 8px;
  border-top: 2px solid #B8CCE8;
  margin-top: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

/* ============================================
   TẦNG 2: SỬA THÔNG TIN
   ============================================ */
.form-section {
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px dashed #B8CCE8;
}

.form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.form-section__title {
  font-family: 'Noto Serif', serif;
  font-size: 14px;
  font-weight: 700;
  color: #01285E;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin: 0 0 14px 0;
  padding-left: 10px;
  border-left: 4px solid #01285E;
  line-height: 1.4;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
}

@media (max-width: 600px) {
  .form-row { grid-template-columns: 1fr; gap: 10px; }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group--full {
  grid-column: 1 / -1;
}

.form-label {
  font-family: 'Inter', 'Be Vietnam Pro', sans-serif;
  font-style: normal;
  font-weight: 600;
  font-size: 13px;
  color: #01285E;
  margin-bottom: 3px;
  line-height: 1.4;
}

.required {
  color: #C62828;
  font-weight: 700;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid #B8CCE8;
  border-radius: 6px;
  font-family: 'Inter', 'Be Vietnam Pro', sans-serif;
  font-style: italic;
  font-size: 14px;
  color: #1A2E4A;
  background: #FFFFFF;
  transition: all 0.2s;
  box-sizing: border-box;
  line-height: 1.6;
}

.form-input:focus {
  outline: none;
  border-color: #5c40d9;
  box-shadow: 0 0 0 3px rgba(92, 64, 217, 0.15);
}

.form-input::placeholder {
  color: #99AACC;
  font-style: italic;
}

.form-input--textarea {
  resize: vertical;
  min-height: 70px;
  line-height: 1.7;
}

.form-input--mono {
  font-family: 'Courier New', monospace;
  font-style: normal;
  font-size: 13px;
  line-height: 1.7;
}

select.form-input {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2301285E' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  padding-right: 34px;
  font-style: normal;
}

.form-hint {
  font-size: 11px;
  color: #99AACC;
  font-style: italic;
  margin: 2px 0 0 0;
  line-height: 1.4;
}

.form-hint-box {
  background: #E8F0FA;
  border-left: 4px solid #5c40d9;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #1A2E4A;
  line-height: 1.6;
  font-style: italic;
}

.form-hint-box p { margin: 0 0 3px 0; }
.form-hint-box p:last-child { margin-bottom: 0; }
.form-hint-box strong { color: #5c40d9; font-style: normal; }

/* AVATAR UPLOAD */
.avatar-upload {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.avatar-preview {
  width: 110px;
  height: 147px;
  border-radius: 8px;
  border: 2px dashed #B8CCE8;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-preview__placeholder {
  font-size: 32px;
  color: #B8CCE8;
}

.avatar-actions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* CROP MODAL */
.crop-modal__content {
  background: #FAF8F0;
  border-radius: 14px;
  width: 100%;
  max-width: 700px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  border: 2px solid #B8CCE8;
}

.crop-modal__image-container {
  flex: 1;
  overflow: hidden;
  background: #0A1F3D;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  min-height: 300px;
}

.crop-modal__image-container img {
  max-width: 100%;
  max-height: 500px;
  display: block;
}

.crop-modal__tools {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background: #D4E0F0;
  border-top: 1px solid #B8CCE8;
  border-bottom: 1px solid #B8CCE8;
  flex-wrap: wrap;
  justify-content: center;
}

/* ============================================
   BUTTONS — MÀU MỚI #5c40d9 + #2d5dac
   ============================================ */
.btn {
  padding: 9px 18px;
  border: none;
  border-radius: 6px;
  font-family: 'Inter', 'Be Vietnam Pro', sans-serif;
  font-style: normal;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

/* Nút chính — XANH TÍM #5c40d9 */
.btn--primary {
  background: #5c40d9;
  color: #FFFFFF;
}
.btn--primary:hover {
  background: #4a32c4;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(92, 64, 217, 0.3);
}

/* Nút phụ — XANH DƯƠNG #2d5dac */
.btn--ghost {
  background: #2d5dac;
  color: #FFFFFF;
  border: none;
}
.btn--ghost:hover {
  background: #1e4080;
  transform: translateY(-1px);
}

/* Nút Xóa — ĐỎ */
.btn--danger {
  background: #C62828;
  color: #FFFFFF;
  border: 1.5px solid #C62828;
}
.btn--danger:hover {
  background: #B71C1C;
}

.btn--small {
  padding: 6px 12px;
  font-size: 12px;
}

/* Nút hành động chính (Đến phả hệ) — full width */
.btn--block {
  width: 100%;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ============================================
   FORM ACTIONS / SPOUSE / CHILDREN
   ============================================ */
.form-actions-inline {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.spouse-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.spouse-row {
  display: grid;
  grid-template-columns: 100px 1fr auto;
  gap: 8px;
  align-items: center;
}

.spouse-row__label {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #01285E;
  font-style: normal;
}

.spouse-row select {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid #B8CCE8;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #1A2E4A;
  background: #FFFFFF;
}

.spouse-row__remove {
  background: transparent;
  border: none;
  font-size: 18px;
  color: #C62828;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 5px;
}
.spouse-row__remove:hover { background: #FFEBEE; }

.children-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.child-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: #FFFFFF;
  border: 1px solid #B8CCE8;
  border-radius: 6px;
  font-size: 13px;
}

.child-item__info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.child-item__name {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  color: #01285E;
  font-style: normal;
}
.child-item__meta { font-size: 11px; color: #99AACC; font-style: italic; }
.child-item__type {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  background: #E8F0FA;
  color: #01285E;
  font-weight: 600;
  white-space: nowrap;
  font-style: normal;
}
.child-item__actions { display: flex; gap: 4px; }
.child-item__btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 3px 6px;
  border-radius: 5px;
}
.child-item__btn:hover { background: #E8F0FA; }

.empty-hint {
  text-align: center;
  color: #99AACC;
  font-style: italic;
  font-size: 12px;
  padding: 16px;
  margin: 0;
  background: #FFFFFF;
  border-radius: 6px;
  border: 1px dashed #B8CCE8;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.contact-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 6px;
  align-items: center;
}

.contact-row input {
  padding: 7px 10px;
  border: 1.5px solid #B8CCE8;
  border-radius: 5px;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  font-style: italic;
  color: #1A2E4A;
  background: #FFFFFF;
}

.contact-row input:focus {
  outline: none;
  border-color: #5c40d9;
  box-shadow: 0 0 0 2px rgba(92, 64, 217, 0.15);
}

.contact-row__remove {
  background: transparent;
  border: none;
  font-size: 16px;
  color: #C62828;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 5px;
}
.contact-row__remove:hover { background: #FFEBEE; }

/* FOOTER */
.form-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 22px;
  border-top: 2px solid #B8CCE8;
  background: #E8F0FA;
  border-radius: 0 0 12px 12px;
  flex-wrap: wrap;
}

.form-modal__footer-left,
.form-modal__footer-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.form-modal__footer .btn { min-width: 90px; }

/* LINKED NOTES */
.linked-notes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.linked-note-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #FFFFFF;
  border: 1px solid #B8CCE8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.linked-note-item:hover {
  background: #E8F0FA;
  border-color: #5c40d9;
}

.linked-note-item__icon { font-size: 16px; }

.linked-note-item__title {
  flex: 1;
  font-family: 'Inter', sans-serif;
  color: #1A2E4A;
  font-weight: 500;
}

.linked-note-item__remove {
  background: transparent;
  border: none;
  font-size: 16px;
  color: #C62828;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.linked-note-item__remove:hover { background: #FFEBEE; }

.notes-picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;
}

.note-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #FFFFFF;
  border: 1px solid #B8CCE8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: #1A2E4A;
}

.note-picker-item:hover {
  background: #E8F0FA;
  border-color: #5c40d9;
}

.note-picker-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #5c40d9;
}

/* RESPONSIVE */
@media (max-width: 600px) {
  .form-modal { padding: 8px !important; align-items: flex-start !important; }
  .form-modal__content { max-height: 96vh; border-radius: 10px; }
  .form-modal__header { padding: 12px 16px; }
  .form-modal__title { font-size: 15px; }
  .form-modal__body { padding: 14px 16px; }
  .form-modal__footer { padding: 10px 16px; flex-direction: column; gap: 8px; }
  .form-modal__footer-left, .form-modal__footer-right { width: 100%; }
  .form-modal__footer .btn { flex: 1; }
  .avatar-upload { flex-direction: column; align-items: center; }
  .avatar-preview { width: 90px; height: 120px; }
  .contact-row { grid-template-columns: 1fr; gap: 4px; }
  .contact-row__remove { justify-self: end; }
  .spouse-row { grid-template-columns: 1fr; gap: 4px; }
  .spouse-row__remove { justify-self: end; }
  .form-section__title { font-size: 12px; }
  .form-label { font-size: 12px; }
  .form-input { font-size: 13px; padding: 8px 10px; }
  .person-view__name { font-size: 22px; }
  .person-view__years { font-size: 16px; }
  .person-view__avatar { width: 120px; height: 160px; }
}

/* ============================================
   FIX ẢNH ĐẠI DIỆN QUÁ TO TRONG TAB XEM
   Giới hạn kích thước ảnh, giữ tỷ lệ 3:4
   ============================================ */

/* Ảnh trong tab Xem (person-view) */
.person-view img,
.person-view__avatar,
.person-view__photo,
#personViewContent img {
  max-width: 240px;
  max-height: 320px;
  width: auto;
  height: auto;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  margin: 0 auto 16px;
  box-shadow: 0 4px 12px rgba(1, 40, 94, 0.15);
}

/* Container ảnh trong form (nếu có wrapper) */
.person-view__avatar-wrap,
.person-view__photo-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 0;
  margin-bottom: 12px;
}

/* Mobile — nhỏ hơn */
@media (max-width: 640px) {
  .person-view img,
  .person-view__avatar,
  .person-view__photo,
  #personViewContent img {
    max-width: 180px;
    max-height: 240px;
  }
}

/* Đảm bảo modal có thể cuộn nếu nội dung dài */
.form-modal__body {
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}