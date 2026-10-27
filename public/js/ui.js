// Функция для красивых уведомлений (Toast)
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">${type === 'success' ? '✅' : '❌'}</span>
            <span style="font-weight: bold; color: white;">${message}</span>
        </div>
        <div style="position: absolute; bottom: 0; left: 0; height: 3px; background: ${type === 'success' ? '#2ECC71' : '#E74C3C'}; width: 100%; animation: shrink 3s linear forwards;"></div>
    `;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) container.remove();
        }, 300);
    }, 3000);
}

// Функция для красивого подтверждения (Modal)
function showConfirm(title, message, onConfirm) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <h3 style="color: var(--accent); margin-bottom: 15px; font-family: 'Cinzel', serif;">${title}</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px;">${message}</p>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-small" id="modal-cancel" style="background: rgba(255,255,255,0.1); color: white;">Отмена</button>
                <button class="btn btn-danger btn-small" id="modal-confirm">Удалить</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalOverlay);

    document.getElementById('modal-cancel').onclick = () => modalOverlay.remove();
    document.getElementById('modal-confirm').onclick = () => {
        onConfirm();
        modalOverlay.remove();
    };
}
