// Функция для красивых уведомлений
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
