// Global variables
let reports = []
let filteredReports = []
let selectedReport = null
let isLoading = false

// DOM elements
const loadingEl = document.getElementById("loading")
const appEl = document.getElementById("app")
const reportsBodyEl = document.getElementById("reportsBody")
const modalEl = document.getElementById("modal")
const searchInput = document.getElementById("searchInput")
const statusFilter = document.getElementById("statusFilter")
const resultCount = document.getElementById("resultCount")
const errorMessageEl = document.getElementById("errorMessage")
const savingIndicator = document.getElementById("saving-indicator")

// Utility functions
function nowISO() {
  return new Date().toISOString()
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function formatVN(dateString) {
  const date = new Date(dateString)
  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function escapeHtml(text) {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

function getStatusClass(status) {
  switch (status) {
    case "Mới":
      return "status-new"
    case "Đang xử lý":
      return "status-processing"
    case "Hoàn thành":
      return "status-done"
    default:
      return "status-new"
  }
}

function showSaving() {
  savingIndicator.classList.remove("hidden")
}

function hideSaving() {
  savingIndicator.classList.add("hidden")
}

function showError(message) {
  console.error("Firebase Error:", message)
  errorMessageEl.classList.remove("hidden")
  hideLoading()
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners()
  // Wait for Firebase to be loaded
  setTimeout(() => {
    if (window.firebaseApp) {
      loadReportsFromFirebase()
    } else {
      showError("Firebase không được tải. Vui lòng kiểm tra cấu hình.")
    }
  }, 1000)
})

// Setup event listeners
function setupEventListeners() {
  // Add report form
  document.getElementById("addBtn").addEventListener("click", addReport)

  // Search and filter
  searchInput.addEventListener("input", filterReports)
  statusFilter.addEventListener("change", filterReports)

  // Modal
  document.querySelector(".close").addEventListener("click", closeModal)
  document.getElementById("saveNoteBtn").addEventListener("click", saveNote)
  document.getElementById("setProcessingBtn").addEventListener("click", () => setStatus("Đang xử lý"))
  document.getElementById("markDoneBtn").addEventListener("click", markDone)

  // Close modal when clicking outside
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal()
  })

  // Enter key for adding reports
  document.getElementById("newTitle").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addReport()
  })
}

// Load reports from Firebase
function loadReportsFromFirebase() {
  try {
    const { db, reportsCollection, onSnapshot, query, orderBy } = window.firebaseApp

    const q = query(reportsCollection, orderBy("createdAt", "desc"))

    onSnapshot(
      q,
      (snapshot) => {
        reports = []
        snapshot.forEach((doc) => {
          reports.push({ id: doc.id, ...doc.data() })
        })

        updateStats()
        filterReports()
        hideLoading()
      },
      (error) => {
        showError(`Lỗi khi tải dữ liệu: ${error.message}`)
      },
    )
  } catch (error) {
    showError(`Lỗi Firebase: ${error.message}`)
  }
}

// Hide loading screen
function hideLoading() {
  loadingEl.classList.add("hidden")
  appEl.classList.remove("hidden")
}

// Update statistics
function updateStats() {
  const newCount = reports.filter((r) => r.status === "Mới").length
  const processingCount = reports.filter((r) => r.status === "Đang xử lý").length
  const doneCount = reports.filter((r) => r.status === "Hoàn thành").length

  document.getElementById("stat-new").textContent = newCount
  document.getElementById("stat-processing").textContent = processingCount
  document.getElementById("stat-done").textContent = doneCount
}

// Filter reports
function filterReports() {
  const searchTerm = searchInput.value.toLowerCase().trim()
  const statusValue = statusFilter.value

  filteredReports = reports.filter((report) => {
    const matchesSearch =
      !searchTerm ||
      report.title.toLowerCase().includes(searchTerm) ||
      (report.description && report.description.toLowerCase().includes(searchTerm)) ||
      (report.reporter && report.reporter.toLowerCase().includes(searchTerm))

    const matchesStatus = statusValue === "Tất cả" || report.status === statusValue

    return matchesSearch && matchesStatus
  })

  resultCount.textContent = `Hiển thị: ${filteredReports.length}/${reports.length} báo cáo`
  renderReports()
}

// Render reports table
function renderReports() {
  if (filteredReports.length === 0) {
    reportsBodyEl.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p><strong>Không tìm thấy báo cáo nào phù hợp</strong></p>
                    <p>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                </td>
            </tr>
        `
    return
  }

  reportsBodyEl.innerHTML = filteredReports
    .map(
      (report) => `
        <tr class="report-row" onclick="openModal('${report.id}')">
            <td>
                <div class="status-dot ${getStatusClass(report.status)}"></div>
            </td>
            <td>
                <div class="report-title">${escapeHtml(report.title)}</div>
                ${report.description ? `<div class="report-desc">${escapeHtml(report.description)}</div>` : ""}
            </td>
            <td class="hidden-mobile">${report.reporter || "-"}</td>
            <td class="hidden-mobile">${formatVN(report.createdAt)}</td>
            <td>
                <span class="status-badge ${getStatusClass(report.status)}">${report.status}</span>
            </td>
            <td class="hidden-mobile">${report.notes.length} ghi chú</td>
        </tr>
    `,
    )
    .join("")
}

// Add report
async function addReport() {
  const title = document.getElementById("newTitle").value.trim()
  const desc = document.getElementById("newDesc").value.trim()
  const reporter = document.getElementById("newReporter").value.trim()

  if (!title || isLoading) return

  isLoading = true
  showSaving()

  const addBtn = document.getElementById("addBtn")
  addBtn.disabled = true
  addBtn.textContent = "⏳ Đang thêm..."

  try {
    const { addDoc, reportsCollection } = window.firebaseApp

    const newReport = {
      title: title,
      description: desc || undefined,
      reporter: reporter || undefined,
      createdAt: nowISO(),
      status: "Mới",
      notes: [
        desc
          ? { id: generateId(), text: `Mô tả ban đầu: ${desc}`, time: nowISO() }
          : { id: generateId(), text: "Tiếp nhận yêu cầu.", time: nowISO() },
      ],
    }

    await addDoc(reportsCollection, newReport)

    // Clear form
    document.getElementById("newTitle").value = ""
    document.getElementById("newDesc").value = ""
    document.getElementById("newReporter").value = ""
  } catch (error) {
    alert(`Lỗi khi thêm báo cáo: ${error.message}`)
  } finally {
    isLoading = false
    hideSaving()
    addBtn.disabled = false
    addBtn.textContent = "Thêm báo cáo"
  }
}

// Open modal
function openModal(reportId) {
  selectedReport = reports.find((r) => r.id === reportId)
  if (!selectedReport) return

  document.getElementById("modalTitle").textContent = selectedReport.title

  // Report info
  document.getElementById("reportInfo").innerHTML = `
        <div class="info-item">
            <div>👤 Người báo:</div>
            <div class="info-value">${selectedReport.reporter || "Không rõ"}</div>
        </div>
        <div class="info-item">
            <div>📅 Ngày tạo:</div>
            <div class="info-value">${formatVN(selectedReport.createdAt)}</div>
        </div>
        <div class="info-item">
            <div>📊 Trạng thái:</div>
            <div class="info-value">
                <span class="status-badge ${getStatusClass(selectedReport.status)}">${selectedReport.status}</span>
            </div>
        </div>
        ${
          selectedReport.description
            ? `
        <div class="info-item" style="grid-column: 1 / -1;">
            <div>📝 Mô tả:</div>
            <div class="info-value">${escapeHtml(selectedReport.description)}</div>
        </div>
        `
            : ""
        }
    `

  // Notes
  document.getElementById("notesCount").textContent = selectedReport.notes.length
  document.getElementById("notesList").innerHTML = selectedReport.notes
    .map(
      (note, index) => `
        <div class="note-item">
            <div class="note-header">
                <span class="note-number">#${selectedReport.notes.length - index}</span>
                <span class="note-time">${formatVN(note.time)}</span>
            </div>
            <div class="note-text">${escapeHtml(note.text)}</div>
            ${note.author ? `<div style="margin-top: 12px; font-size: 0.8rem; color: #64748b; font-weight: 500;">👤 Bởi: ${escapeHtml(note.author)}</div>` : ""}
        </div>
    `,
    )
    .join("")

  // Update button states
  document.getElementById("setProcessingBtn").disabled = selectedReport.status === "Đang xử lý"
  document.getElementById("markDoneBtn").disabled = selectedReport.status === "Hoàn thành"

  // Clear new note
  document.getElementById("newNote").value = ""

  modalEl.style.display = "block"
}

// Close modal
function closeModal() {
  modalEl.style.display = "none"
  selectedReport = null
}

// Save note
async function saveNote() {
  const noteText = document.getElementById("newNote").value.trim()
  if (!noteText || !selectedReport || isLoading) return

  isLoading = true
  const saveBtn = document.getElementById("saveNoteBtn")
  saveBtn.disabled = true
  saveBtn.textContent = "⏳ Đang lưu..."

  try {
    const { updateDoc, doc, db } = window.firebaseApp

    const newNote = {
      id: generateId(),
      text: noteText,
      time: nowISO(),
    }

    const updatedNotes = [...selectedReport.notes, newNote]

    await updateDoc(doc(db, "bug_reports", selectedReport.id), {
      notes: updatedNotes,
    })

    document.getElementById("newNote").value = ""
  } catch (error) {
    alert(`Lỗi khi lưu ghi chú: ${error.message}`)
  } finally {
    isLoading = false
    saveBtn.disabled = false
    saveBtn.textContent = "💾 Lưu ghi chú"
  }
}

// Set status
async function setStatus(status) {
  if (!selectedReport || isLoading) return

  isLoading = true

  try {
    const { updateDoc, doc, db } = window.firebaseApp

    await updateDoc(doc(db, "bug_reports", selectedReport.id), {
      status: status,
    })
  } catch (error) {
    alert(`Lỗi khi cập nhật trạng thái: ${error.message}`)
  } finally {
    isLoading = false
  }
}

// Mark as done
async function markDone() {
  if (!selectedReport || isLoading) return

  isLoading = true
  const markBtn = document.getElementById("markDoneBtn")
  markBtn.disabled = true
  markBtn.textContent = "⏳ Đang cập nhật..."

  try {
    const { updateDoc, doc, db } = window.firebaseApp

    const completionNote = {
      id: generateId(),
      text: "Xác nhận Hoàn thành.",
      time: nowISO(),
    }

    const updatedNotes = [...selectedReport.notes, completionNote]

    await updateDoc(doc(db, "bug_reports", selectedReport.id), {
      status: "Hoàn thành",
      notes: updatedNotes,
    })
  } catch (error) {
    alert(`Lỗi khi đánh dấu hoàn thành: ${error.message}`)
  } finally {
    isLoading = false
    markBtn.disabled = false
    markBtn.textContent = "✅ Hoàn thành"
  }
}
