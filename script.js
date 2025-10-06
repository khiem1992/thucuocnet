// THAY THẾ URL NÀY VỚI WEB APP URL CỦA BẠN TỪ GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbyzdKZHo8MxJn7EOxZBkCmEIDaitostIjCU8fU1bg9CpEwE2CQh0yvOR0hfmJr68CDKNA/exec'; 

let currentCustomerData = null; 

// --- Helpers ---
function formatMoney(amount) {
    if (isNaN(amount) || amount === null) return '0';
    return amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function unformatMoney(text) {
    return parseFloat(text.replace(/\./g, '')) || 0;
}

function formatModalMoney(input) {
    const amount = unformatMoney(input.value);
    input.value = formatMoney(amount);
}

function formatDateToDisplay(date) {
    if (!date) return 'Chưa có dữ liệu';
    const d = new Date(date);
    if (isNaN(d)) return date; 

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function convertDDMMYYYYtoYYYYMMDD(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

// --- Logic Tính toán Hạn dùng mới (Đã tinh chỉnh theo yêu cầu) ---
function calculateMonthsAndDueDate(currentDueDateStr, paidAmount, fee) {
    let monthsToAdd = Math.floor(paidAmount / fee);
    let specialMonths = 0;
    
    // Quy tắc đặc biệt: 500k, 700k, 800k, 1M => +12 tháng
    const specialAmounts = [500000, 700000, 800000, 1000000];
    if (specialAmounts.includes(paidAmount) && monthsToAdd < 12) {
        specialMonths = 12;
    }

    monthsToAdd = Math.max(monthsToAdd, specialMonths); 
    
    // 1. Lấy ngày hết hạn cũ (DD/MM/YYYY)
    let currentDueDate = new Date(convertDDMMYYYYtoYYYYMMDD(currentDueDateStr));
    if (isNaN(currentDueDate.getTime())) {
        // Nếu không có ngày hợp lệ, dùng ngày hiện tại làm mốc
        currentDueDate = new Date();
    }
    
    // Đặt ngày hết hạn CŨ là ngày cuối cùng của tháng đó làm mốc tính
    const lastDayOfMonth = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, 0); 
    
    // 2. Cộng thêm số tháng từ ngày cuối tháng làm mốc
    const newDate = new Date(lastDayOfMonth);
    newDate.setMonth(newDate.getMonth() + monthsToAdd);
    
    // 3. Đảm bảo ngày kết quả vẫn là ngày cuối tháng đó
    newDate.setDate(1); 
    newDate.setMonth(newDate.getMonth() + 1);
    newDate.setDate(0); // Lùi 1 ngày về ngày cuối cùng của tháng trước

    const newDueDateDisplay = formatDateToDisplay(newDate);
    // Chuẩn bị format cho Google Sheet (YYYY-MM-DD)
    const newDueDateForScript = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;

    return {
        months: monthsToAdd,
        newDueDateDisplay: newDueDateDisplay, // DD/MM/YYYY (cho hiển thị)
        newDueDateForScript: newDueDateForScript // YYYY-MM-DD (cho Apps Script)
    };
}


// --- Main Logic ---

async function loadCustomerList() {
    try {
        const response = await fetch(`${API_URL}?action=getCustomers`);
        const customerList = await response.json();
        
        const select = document.getElementById('customerSelect');
        const messageEl = document.getElementById('message');
        
        if (select) {
             select.innerHTML = '<option value="">-- Chọn Khách Hàng --</option>';

             customerList.forEach(kh => {
                 const option = document.createElement('option');
                 option.value = kh.name;
                 option.textContent = kh.name;
                 select.appendChild(option);
             });
        }
    } catch (error) {
        const messageEl = document.getElementById('message');
        if (messageEl) {
            messageEl.className = 'text-red-500';
            messageEl.textContent = '❌ Lỗi tải danh sách KH: ' + error.message;
        }
    }
}

async function loadCustomerDetail() {
    const khName = document.getElementById('customerSelect')?.value;
    const messageEl = document.getElementById('message');
    if (messageEl) messageEl.textContent = '';
    
    // Hàm reset giao diện (Giúp tránh lỗi 'null')
    const resetUI = (dueDateText) => {
        currentCustomerData = null;
        if (document.getElementById('currentFeeDisplay')) document.getElementById('currentFeeDisplay').textContent = '';
        if (document.getElementById('paidAmount')) document.getElementById('paidAmount').value = '';
        if (document.getElementById('newNote')) document.getElementById('newNote').value = '';
        if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = '';
        if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = dueDateText;
        
        // Reset khối Lịch sử
        if (document.getElementById('prevDueDate')) document.getElementById('prevDueDate').textContent = '...';
        if (document.getElementById('prevPaidDate')) document.getElementById('prevPaidDate').textContent = '...';
        if (document.getElementById('prevAmountHistory')) document.getElementById('prevAmountHistory').textContent = '...';
        if (document.getElementById('oldNote')) document.getElementById('oldNote').textContent = '...';
    }

    if (!khName) {
        resetUI('Chưa chọn KH');
        return;
    }

    try {
        const response = await fetch(`${API_URL}?action=getCustomerDetail&name=${encodeURIComponent(khName)}`);
        const result = await response.json();

        if (result.status === 'success') {
            currentCustomerData = result.data;
            const fee = formatMoney(currentCustomerData.Góicước) + ' VND';
            
            // Cập nhật Khối 1: Gói cước
            if (document.getElementById('currentFeeDisplay')) {
                 document.getElementById('currentFeeDisplay').textContent = `Gói cước: ${fee}`;
            }
            
            // Cập nhật Khối 3: Lịch sử gần nhất
            if (document.getElementById('prevDueDate')) document.getElementById('prevDueDate').textContent = currentCustomerData.Hạndùng; 
            if (document.getElementById('prevPaidDate')) document.getElementById('prevPaidDate').textContent = currentCustomerData.Ngàynộp; 
            if (document.getElementById('prevAmountHistory')) document.getElementById('prevAmountHistory').textContent = formatMoney(currentCustomerData.Sốtiền || 0) + ' VND';
            if (document.getElementById('oldNote')) document.getElementById('oldNote').textContent = currentCustomerData.Ghichú || 'Không có';

            // Reset Khối 2
            if (document.getElementById('paidAmount')) document.getElementById('paidAmount').value = ''; 
            if (document.getElementById('newNote')) document.getElementById('newNote').value = '';
            if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = '';
            if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = currentCustomerData.Hạndùng;

        } else {
            if (messageEl) {
                messageEl.className = 'text-red-500';
                messageEl.textContent = '❌ Lỗi tải chi tiết KH từ Apps Script: ' + result.message;
            }
            resetUI('Lỗi');
        }

    } catch (error) {
        if (messageEl) {
            messageEl.className = 'text-red-500';
            messageEl.textContent = '❌ Lỗi kết nối API: ' + error.message;
        }
        resetUI('Lỗi');
    }
}

function formatAndCalculate() {
    const paidAmountInput = document.getElementById('paidAmount');
    let value = paidAmountInput?.value.replace(/\./g, '') || '';
    
    if (isNaN(value) || value === '') {
        if (paidAmountInput) paidAmountInput.value = '';
        // Reset Khối 2
        if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = '';
        if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = currentCustomerData ? currentCustomerData.Hạndùng : 'Chưa chọn KH';
        return;
    }
    
    const amount = parseInt(value, 10);
    if (paidAmountInput) paidAmountInput.value = formatMoney(amount); 

    if (currentCustomerData) {
        const fee = currentCustomerData.Góicước; 
        const currentDueDateStr = currentCustomerData.Hạndùng; 
        
        if (fee > 0) {
            const { months, newDueDateDisplay } = calculateMonthsAndDueDate(currentDueDateStr, amount, fee);
            
            if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = `${months} tháng`;
            if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = newDueDateDisplay;
        } else {
            if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = 'Không xác định (Gói cước = 0)';
            if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = currentDueDateStr;
        }

    } else {
        if (document.getElementById('monthsDisplay')) document.getElementById('monthsDisplay').textContent = '';
        if (document.getElementById('newDueDateDisplay')) document.getElementById('newDueDateDisplay').textContent = 'Chưa chọn KH';
    }
}

async function confirmPayment() {
    if (!currentCustomerData) {
        document.getElementById('message').className = 'text-red-500';
        document.getElementById('message').textContent = '❌ Vui lòng chọn Khách Hàng.';
        return;
    }

    const khName = document.getElementById('customerSelect')?.value;
    const paidAmountRaw = document.getElementById('paidAmount')?.value;
    const paidAmount = unformatMoney(paidAmountRaw);
    const fee = currentCustomerData.Góicước;
    const newNote = document.getElementById('newNote')?.value;
    const confirmButton = document.getElementById('confirmButton');
    const messageEl = document.getElementById('message');
    
    if (paidAmount <= 0) {
        if (messageEl) {
            messageEl.className = 'text-red-500';
            messageEl.textContent = '❌ Vui lòng nhập số tiền nộp hợp lệ.';
        }
        return;
    }

    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = '⏳ Đang xử lý...';
    }
    if (messageEl) messageEl.textContent = '⏳ Đang xử lý...';

    const { months, newDueDateDisplay, newDueDateForScript } = calculateMonthsAndDueDate(currentCustomerData.Hạndùng, paidAmount, fee);

    const payload = {
        action: 'confirmPayment',
        customerName: khName,
        paidAmount: paidAmount,
        fee: fee, 
        months: months,
        newDueDate: newDueDateForScript, // YYYY-MM-DD
        newDueDateDisplay: newDueDateDisplay, // DD/MM/YYYY (cho thông báo)
        newNote: newNote
    };
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === 'success') {
            if (messageEl) {
                messageEl.className = 'text-green-600 font-bold';
                messageEl.textContent = `✅ Đã nộp tiền cho "${result.name}", hạn sử dụng mới đến "${result.newDueDate}".`;
            }
            
            // Tải lại chi tiết để cập nhật lịch sử và hạn dùng
            setTimeout(() => {
                loadCustomerList();
                document.getElementById('customerSelect').value = khName;
                loadCustomerDetail();
            }, 1000);
            
        } else {
            if (messageEl) {
                messageEl.className = 'text-red-500';
                messageEl.textContent = '❌ LỖI API: ' + result.message;
            }
        }

    } catch (error) {
        if (messageEl) {
            messageEl.className = 'text-red-500';
            messageEl.textContent = '❌ LỖI KẾT NỐI: ' + error.message;
        }
    } finally {
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Xác Nhận Nộp Tiền';
        }
    }
}

// --- Modal Logic ---

function openNewCustomerModal() {
    document.getElementById('newCustomerModal')?.classList.remove('hidden');
    document.getElementById('modalMessage')?.textContent = '';
    document.getElementById('newCustomerForm')?.reset();
}

function closeNewCustomerModal() {
    document.getElementById('newCustomerModal')?.classList.add('hidden');
}

async function addNewCustomer() {
    const khName = document.getElementById('modalTenKH')?.value.trim();
    const fee = parseFloat(document.getElementById('modalGoiCuoc')?.value);
    const paidAmount = unformatMoney(document.getElementById('modalTienNop')?.value);
    const dueDateStr = document.getElementById('modalHanDung')?.value.trim();
    const note = document.getElementById('modalGhiChu')?.value;
    const modalConfirmButton = document.getElementById('modalConfirmButton');
    const modalMessage = document.getElementById('modalMessage');

    if (!khName || isNaN(fee) || fee <= 0 || paidAmount <= 0 || !dueDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        if (modalMessage) {
            modalMessage.className = 'text-red-500';
            modalMessage.textContent = '❌ Vui lòng nhập đủ thông tin hợp lệ (Gói cước, Tiền nộp > 0, Hạn dùng DD/MM/YYYY).';
        }
        return;
    }
    
    if (modalConfirmButton) {
        modalConfirmButton.disabled = true;
        modalConfirmButton.textContent = '⏳ Đang thêm...';
    }
    if (modalMessage) modalMessage.textContent = '⏳ Đang xử lý...';

    const payload = {
        action: 'addCustomer',
        TênKH: khName,
        GóiCước: fee,
        TiềnNộpBanĐầu: paidAmount,
        HạnDùng: dueDateStr, 
        GhiChú: note
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === 'success') {
            if (modalMessage) {
                modalMessage.className = 'text-green-600 font-bold';
                modalMessage.textContent = `✅ Đã tạo khách hàng "${result.name}", hạn sử dụng ban đầu đến "${result.newDueDate}".`;
            }
            
            // Tải lại danh sách KH và đóng modal
            setTimeout(() => {
                loadCustomerList();
                closeNewCustomerModal();
            }, 3000);
        } else {
            if (modalMessage) {
                modalMessage.className = 'text-red-500';
                modalMessage.textContent = '❌ LỖI API: ' + result.message;
            }
        }
    } catch (error) {
        if (modalMessage) {
            modalMessage.className = 'text-red-500';
            modalMessage.textContent = '❌ LỖI KẾT NỐI: ' + error.message;
        }
    } finally {
        if (modalConfirmButton) {
            modalConfirmButton.disabled = false;
            modalConfirmButton.textContent = 'Thêm Khách Hàng';
        }
    }
}

window.onload = loadCustomerList;
