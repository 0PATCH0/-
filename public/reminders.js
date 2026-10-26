<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Напоминания</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="sidebar">
        <h2 id="server-name">Загрузка...</h2>
        <a href="/dashboard" style="color: var(--text-muted); margin-bottom: 20px;">← К списку серверов</a>
        <hr style="border-color: var(--border-color);">
        <a href="#" id="link-back">🏠 На главную</a>
        <a href="#" class="active">⏰ Напоминания</a>
    </div>
    <div class="content">
        <div class="header"><h1>⏰ Управление напоминаниями</h1></div>
        <div class="grid" id="reminders-list">
            <p>Загрузка...</p>
        </div>
    </div>
    <script>
        const guildId = window.location.pathname.split('/')[2];
        document.getElementById('link-back').href = `/manage/${guildId}`;

        fetch(`/api/guild/${guildId}/reminders`)
            .then(res => res.json())
            .then(data => {
                const list = document.getElementById('reminders-list');
                if (data.length === 0) {
                    list.innerHTML = '<p>Активных напоминаний нет.</p>';
                    return;
                }
                list.innerHTML = '';
                data.forEach(r => {
                    const time = new Date(r.nextTime).toLocaleString('ru-RU');
                    list.innerHTML += `
                        <div class="card" style="cursor: default;">
                            <h3>${r.text}</h3>
                            <p>Сработает: <b>${time}</b></p>
                            <p>Повтор: ${r.repeat}</p>
                            <button class="btn btn-danger btn-small" style="margin-top: 15px;" onclick="deleteReminder('${r.id}')">Удалить</button>
                        </div>
                    `;
                });
            });

        function deleteReminder(id) {
            if (!confirm('Удалить напоминание?')) return;
            fetch(`/api/reminders/${id}`, { method: 'DELETE' }).then(() => window.location.reload());
        }
    </script>
</body>
</html>
