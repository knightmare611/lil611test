let xSocialFilter = 'all';
let xActivePanel = 'home';

function setupXSocialFeature() {
    bindXClick('x-publish-btn', publishXUserPost);
    bindXClick('x-generate-btn', generateXCharacterPost);
    bindXClick('x-social-refresh-btn', renderXSocialScreen);
    bindXClick('x-world-create-btn', createXWorldFromInput);
    bindXClick('x-world-save-btn', saveXWorldSettings);
    bindXClick('x-world-cancel-btn', closeXWorldSettings);

    document.querySelectorAll('.x-feed-tab').forEach(btn => {
        if (btn.dataset.xBound) return;
        btn.dataset.xBound = '1';
        btn.addEventListener('click', () => {
            document.querySelectorAll('.x-feed-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            xSocialFilter = btn.dataset.xFilter || 'all';
            renderXSocialFeed();
        });
    });

    document.querySelectorAll('.x-nav-btn').forEach(btn => {
        if (btn.dataset.xBound) return;
        btn.dataset.xBound = '1';
        btn.addEventListener('click', () => switchXPanel(btn.dataset.xPanelTarget || 'home'));
    });

    const searchInput = document.getElementById('x-search-input');
    if (searchInput && !searchInput.dataset.xBound) {
        searchInput.dataset.xBound = '1';
        searchInput.addEventListener('input', renderXSearch);
    }
}

function bindXClick(id, handler) {
    const el = document.getElementById(id);
    if (!el || el.dataset.xBound) return;
    el.dataset.xBound = '1';
    el.addEventListener('click', handler);
}

function renderXSocialScreen() {
    setupXSocialFeature();
    ensureXWorlds();
    renderXWorldLabel();
    populateXCharacterSelect();
    renderXSocialFeed();
    renderXSearch();
    renderXNotifications();
    renderXMessages();
    renderXWorldList();
    switchXPanel(xActivePanel);
}

function switchXPanel(panel) {
    xActivePanel = panel;
    document.querySelectorAll('.x-tab-panel').forEach(el => {
        el.classList.toggle('active', el.dataset.xPanel === panel);
    });
    document.querySelectorAll('.x-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.xPanelTarget === panel);
    });
    if (panel === 'search') renderXSearch();
    if (panel === 'notifications') renderXNotifications();
    if (panel === 'messages') renderXMessages();
    if (panel === 'worlds') renderXWorldList();
}

function ensureXWorlds() {
    if (!Array.isArray(db.xSocialWorlds)) db.xSocialWorlds = [];
    if (!db.xSocialWorlds.length) {
        db.xSocialWorlds.push({
            id: createXId('xworld'),
            name: '默认世界',
            description: '所有角色都能看到的默认时间线。',
            worldBookIds: [],
            characterIds: [],
            createdAt: Date.now()
        });
    }
    if (!db.xSocialActiveWorldId || !db.xSocialWorlds.some(world => world.id === db.xSocialActiveWorldId)) {
        db.xSocialActiveWorldId = db.xSocialWorlds[0].id;
    }
}

function getActiveXWorld() {
    ensureXWorlds();
    return db.xSocialWorlds.find(world => world.id === db.xSocialActiveWorldId) || db.xSocialWorlds[0];
}

function getXPosts() {
    ensureXWorlds();
    if (!Array.isArray(db.xSocialPosts)) db.xSocialPosts = [];
    const activeWorld = getActiveXWorld();
    db.xSocialPosts.forEach(post => {
        if (!post.worldId) post.worldId = activeWorld.id;
    });
    return db.xSocialPosts;
}

function getActiveXPosts() {
    const world = getActiveXWorld();
    return getXPosts().filter(post => post.worldId === world.id);
}

function getXMessages() {
    ensureXWorlds();
    if (!Array.isArray(db.xSocialMessages)) db.xSocialMessages = [];
    return db.xSocialMessages;
}

function getActiveXMessages() {
    const world = getActiveXWorld();
    return getXMessages().filter(thread => thread.worldId === world.id);
}

async function saveXSocialData() {
    if (typeof saveGlobalKeys === 'function') {
        await saveGlobalKeys(['xSocialPosts', 'xSocialMessages', 'xSocialWorlds', 'xSocialActiveWorldId']);
    }
}

function renderXWorldLabel() {
    const label = document.getElementById('x-world-label');
    const world = getActiveXWorld();
    if (label) label.textContent = world.name || '未命名世界';
}

function populateXCharacterSelect() {
    const select = document.getElementById('x-character-select');
    if (!select) return;
    const world = getActiveXWorld();
    const allowed = new Set(world.characterIds || []);
    const chars = (db.characters || []).filter(char => !allowed.size || allowed.has(char.id));
    const currentValue = select.value;
    select.innerHTML = '<option value="">选择角色生成动态</option>';
    chars.forEach(char => {
        const opt = document.createElement('option');
        opt.value = char.id;
        opt.textContent = char.remarkName || char.realName || '未命名角色';
        select.appendChild(opt);
    });
    if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) select.value = currentValue;
}

async function publishXUserPost() {
    const input = document.getElementById('x-compose-input');
    const content = (input?.value || '').trim();
    if (!content) return notifyX('先写点内容再发布');
    const world = getActiveXWorld();
    const identity = db.forumUserIdentity || {};
    getXPosts().unshift({
        id: createXId('x'),
        worldId: world.id,
        type: 'user',
        authorId: 'user',
        authorName: identity.nickname || '我',
        handle: identity.anonCode ? `@me_${identity.anonCode}` : '@me',
        avatar: identity.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        content,
        timestamp: Date.now(),
        likes: 0,
        reposts: 0,
        replies: []
    });
    input.value = '';
    await saveXSocialData();
    renderXSocialScreen();
}

async function generateXCharacterPost() {
    const select = document.getElementById('x-character-select');
    const charId = select?.value;
    if (!charId) return notifyX('先选择一个角色');
    const character = (db.characters || []).find(c => c.id === charId);
    if (!character) return;
    const btn = document.getElementById('x-generate-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '生成中';
    }
    try {
        const world = getActiveXWorld();
        const generatedPosts = await requestXCharacterPosts(character, world);
        const authorName = character.remarkName || character.realName || '未命名角色';
        const handle = `@${(character.realName || character.remarkName || 'char').replace(/\s+/g, '_')}`;
        const avatar = character.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        const now = Date.now();
        generatedPosts.slice().reverse().forEach((post, index) => {
            getXPosts().unshift({
                id: createXId('x'),
                worldId: world.id,
                type: 'character',
                authorId: character.id,
                authorName,
                handle,
                avatar,
                content: post.content,
                context: post.timeLabel ? `来自当前世界 · ${post.timeLabel}` : '来自当前世界',
                timestamp: now - index * 60000,
                likes: Math.floor(Math.random() * 12),
                reposts: Math.floor(Math.random() * 4),
                replies: []
            });
        });
        await saveXSocialData();
        renderXSocialScreen();
    } catch (error) {
        console.error('[X] 角色动态生成失败:', error);
        notifyX('生成失败，请检查 API 设置');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '角色生成';
        }
    }
}

async function requestXCharacterPosts(character, world) {
    const context = getXRecentChatContext(character, 8);
    const worldContext = getXWorldContext(world);
    const fallback = [{ content: buildXFallbackPost(character, context), timeLabel: '刚刚' }];
    const api = db.apiSettings || {};
    if (!api.url || !api.key || !api.model) return fallback;
    const charName = character.realName || character.remarkName || '未命名角色';
    const userName = character.myName || '用户';
    const prompt = `你正在模拟角色 ${charName} 的社交媒体（类似微博/X）私密小号。

【当前 X 世界】
世界名称：${world.name || '默认世界'}
世界说明：${world.description || '无'}
世界观资料：
${worldContext || '暂无'}

【角色人设】
${character.persona || '无'}

【最近聊天上下文】
${context || '暂无'}

【任务：小号内容记录】
请为 ${charName} 生成一个符合其人设的私密小号/X 近期动态。内容要生活化、碎片化，符合小号的风格，并与Ta的人设、当前世界观和最近聊天上下文高度相关。

请注意：
1. 请生成 3-4 条最近的帖子内容。
2. 帖子必须按照**时间倒序**输出（最上面的 #POST# 是最新发布的，最下面的相对较早）。
3. 帖子之间的时间和内容逻辑必须符合客观常识！例如：如果下面的一条是准备睡觉，上面最新的一条就不能是刚吃晚餐这种时间倒流的逻辑。
4. 每条 #POST# 的第一行用方括号包含生成时间（必须写成距离现在的相对时间，例如[15分钟前]、[2小时前]、[昨天]等），下方是正文（140字以内）。
5. 只写 ${charName} 会发在小号/X 上的内容，不要写给 ${userName} 的私聊消息，不要生成 ===PROACTIVE_MESSAGES===。

请严格按照以下标签文本格式输出：
#POST#
[15分钟前]
第一条正文内容（最新）
#POST#
[2小时前]
第二条正文内容（较早）`;
    const response = await fetch(`${api.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
        body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim();
    const posts = parseXGeneratedPosts(text);
    return posts.length ? posts : fallback;
}

function parseXGeneratedPosts(text) {
    if (!text) return [];
    return text.split(/#POST#/i)
        .slice(1)
        .map(block => {
            const match = block.match(/^\s*\[([^\]]+)\]\s*([\s\S]*?)\s*$/);
            const content = match ? match[2] : block;
            return {
                timeLabel: match ? match[1].trim() : '',
                content: content.replace(/^["“]|["”]$/g, '').trim().slice(0, 180)
            };
        })
        .filter(post => post.content);
}

function getXWorldContext(world) {
    return (db.worldBooks || [])
        .filter(book => (world.worldBookIds || []).includes(book.id))
        .map(book => `${book.name || '世界书'}：${book.content || ''}`.slice(0, 900))
        .join('\n');
}

function getXRecentChatContext(character, limit = 6) {
    return (character.history || [])
        .filter(msg => !msg.isHidden && !msg.isAiIgnore && msg.role !== 'system')
        .slice(-limit)
        .map(msg => {
            const who = msg.role === 'user' ? (character.myName || '我') : (character.realName || character.remarkName || '角色');
            return `${who}: ${String(msg.content || '').replace(/\s+/g, ' ').slice(0, 90)}`;
        })
        .join('\n');
}

function buildXFallbackPost(character, context) {
    const name = character.realName || character.remarkName || '我';
    return context ? `${name}：刚刚想到一些事，先记在这里。` : `${name}：今天也在自己的节奏里。`;
}

function renderXSocialFeed() {
    const list = document.getElementById('x-feed-list');
    if (!list) return;
    let posts = [...getActiveXPosts()];
    if (xSocialFilter === 'mine') posts = posts.filter(post => post.type === 'user');
    if (xSocialFilter === 'chars') posts = posts.filter(post => post.type === 'character');
    posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderXPostList(list, posts, '当前世界还没有动态。');
}

function renderXSearch() {
    const list = document.getElementById('x-search-results');
    if (!list) return;
    const query = (document.getElementById('x-search-input')?.value || '').trim().toLowerCase();
    const posts = query
        ? getActiveXPosts().filter(post => `${post.authorName || ''} ${post.content || ''}`.toLowerCase().includes(query))
        : [];
    renderXPostList(list, posts, query ? '没有搜到相关动态。' : '输入关键词搜索当前世界。');
}

function renderXNotifications() {
    const list = document.getElementById('x-notification-list');
    if (!list) return;
    const posts = getActiveXPosts().filter(post => (post.likes || 0) || (post.reposts || 0) || (post.replies || []).length).slice(0, 30);
    if (!posts.length) {
        list.innerHTML = '<div class="x-empty-feed">当前世界还没有通知。</div>';
        return;
    }
    list.innerHTML = posts.map(post => `
        <article class="x-list-card">
            <div class="x-post-name">${escapeXHtml(post.authorName || '未知')}</div>
            <div class="x-card-meta">${post.likes || 0} 喜欢 · ${post.reposts || 0} 转发 · ${post.replies?.length || 0} 回复</div>
            <div class="x-post-body">${escapeXHtml(post.content || '')}</div>
        </article>
    `).join('');
}

function renderXMessages() {
    const list = document.getElementById('x-message-list');
    if (!list) return;
    const threads = getActiveXMessages().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!threads.length) {
        list.innerHTML = '<div class="x-empty-feed">当前世界还没有 X 私信。这里不会读取聊天 App 的私聊记录。</div>';
        return;
    }
    list.innerHTML = threads.map(thread => {
        const last = (thread.messages || []).slice(-1)[0];
        return `
            <article class="x-list-card">
                <div class="x-post-head">
                    <img class="x-post-avatar" src="${escapeXHtml(thread.avatar || '')}" alt="">
                    <div>
                        <div class="x-post-name">${escapeXHtml(thread.name || '未命名联系人')}</div>
                        <div class="x-card-meta">${escapeXHtml(last ? String(last.content || '').slice(0, 60) : '暂无消息')}</div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderXPostList(list, posts, emptyText) {
    if (!posts.length) {
        list.innerHTML = `<div class="x-empty-feed">${escapeXHtml(emptyText)}</div>`;
        return;
    }
    list.innerHTML = posts.map(post => `
        <article class="x-post-card" data-post-id="${post.id}">
            <div class="x-post-head">
                <img class="x-post-avatar" src="${escapeXHtml(post.avatar || '')}" alt="">
                <div style="min-width:0;flex:1;">
                    <div class="x-post-name-line">
                        <span class="x-post-name">${escapeXHtml(post.authorName || '未知')}</span>
                        <span class="x-post-handle">${escapeXHtml(post.handle || '@x')}</span>
                    </div>
                    <div class="x-post-time">${formatXTime(post.timestamp)}</div>
                </div>
            </div>
            <div class="x-post-body">${escapeXHtml(post.content || '')}</div>
            ${post.context ? `<div class="x-post-context">${escapeXHtml(post.context)}</div>` : ''}
            <div class="x-post-actions">
                <button type="button" data-x-action="reply">回复 ${post.replies?.length || 0}</button>
                <button type="button" data-x-action="repost">转发 ${post.reposts || 0}</button>
                <button type="button" data-x-action="like">喜欢 ${post.likes || 0}</button>
                <button type="button" data-x-action="delete">删除</button>
            </div>
        </article>
    `).join('');
    list.querySelectorAll('[data-x-action]').forEach(btn => {
        btn.addEventListener('click', () => handleXPostAction(btn.closest('.x-post-card')?.dataset.postId, btn.dataset.xAction));
    });
}

async function handleXPostAction(postId, action) {
    const post = getXPosts().find(item => item.id === postId);
    if (!post) return;
    if (action === 'like') post.likes = (post.likes || 0) + 1;
    if (action === 'repost') post.reposts = (post.reposts || 0) + 1;
    if (action === 'reply') {
        const reply = await AppUI.prompt('写一条回复：', '', '回复动态');
        if (!reply) return;
        post.replies = post.replies || [];
        post.replies.push({ content: reply, timestamp: Date.now() });
    }
    if (action === 'delete') {
        const ok = await AppUI.confirm('确定删除这条动态吗？', '删除动态', '删除', '取消');
        if (!ok) return;
        db.xSocialPosts = getXPosts().filter(item => item.id !== postId);
    }
    await saveXSocialData();
    renderXSocialScreen();
}

async function createXWorldFromInput() {
    const input = document.getElementById('x-world-name-input');
    const name = (input?.value || '').trim() || '新世界';
    const world = {
        id: createXId('xworld'),
        name,
        description: '',
        worldBookIds: [],
        characterIds: [],
        createdAt: Date.now()
    };
    db.xSocialWorlds.push(world);
    db.xSocialActiveWorldId = world.id;
    if (input) input.value = '';
    await saveXSocialData();
    renderXSocialScreen();
    openXWorldSettings(world.id);
}

function renderXWorldList() {
    const list = document.getElementById('x-world-list');
    if (!list) return;
    ensureXWorlds();
    list.innerHTML = db.xSocialWorlds.map(world => {
        const postCount = getXPosts().filter(post => post.worldId === world.id).length;
        const active = world.id === db.xSocialActiveWorldId;
        return `
            <article class="x-world-card ${active ? 'active' : ''}" data-world-id="${world.id}">
                <div class="x-world-card-head">
                    <div>
                        <div class="x-world-title">${escapeXHtml(world.name || '未命名世界')}</div>
                        <div class="x-card-meta">${postCount} 条动态 · ${(world.characterIds || []).length} 个角色 · ${(world.worldBookIds || []).length} 本世界书</div>
                    </div>
                    <div class="x-card-meta">${active ? '当前' : ''}</div>
                </div>
                <div class="x-post-body">${escapeXHtml(world.description || '暂无说明')}</div>
                <div class="x-world-actions">
                    <button type="button" data-x-world-action="switch">切换</button>
                    <button type="button" data-x-world-action="edit">设置</button>
                    <button type="button" data-x-world-action="delete">删除</button>
                </div>
            </article>
        `;
    }).join('');
    list.querySelectorAll('[data-x-world-action]').forEach(btn => {
        btn.addEventListener('click', () => handleXWorldAction(btn.closest('.x-world-card')?.dataset.worldId, btn.dataset.xWorldAction));
    });
}

async function handleXWorldAction(worldId, action) {
    const world = db.xSocialWorlds.find(item => item.id === worldId);
    if (!world) return;
    if (action === 'switch') {
        db.xSocialActiveWorldId = world.id;
        await saveXSocialData();
        renderXSocialScreen();
        switchXPanel('home');
    }
    if (action === 'edit') openXWorldSettings(world.id);
    if (action === 'delete') {
        if (db.xSocialWorlds.length <= 1) return notifyX('至少保留一个世界');
        const ok = await AppUI.confirm(`确定删除「${world.name}」吗？这个世界下的 X 动态也会删除。`, '删除世界', '删除', '取消');
        if (!ok) return;
        db.xSocialWorlds = db.xSocialWorlds.filter(item => item.id !== world.id);
        db.xSocialPosts = getXPosts().filter(post => post.worldId !== world.id);
        if (db.xSocialActiveWorldId === world.id) db.xSocialActiveWorldId = db.xSocialWorlds[0]?.id || '';
        await saveXSocialData();
        renderXSocialScreen();
    }
}

function openXWorldSettings(worldId) {
    const world = db.xSocialWorlds.find(item => item.id === worldId) || getActiveXWorld();
    document.getElementById('x-world-edit-id').value = world.id;
    document.getElementById('x-world-edit-name').value = world.name || '';
    document.getElementById('x-world-edit-desc').value = world.description || '';
    renderXCheckList('x-worldbook-check-list', db.worldBooks || [], world.worldBookIds || [], item => item.name || '未命名世界书');
    renderXCheckList('x-world-character-check-list', db.characters || [], world.characterIds || [], item => item.realName || item.remarkName || '未命名角色');
    document.getElementById('x-world-settings-modal')?.classList.add('visible');
}

function closeXWorldSettings() {
    document.getElementById('x-world-settings-modal')?.classList.remove('visible');
}

async function saveXWorldSettings() {
    const id = document.getElementById('x-world-edit-id')?.value;
    const world = db.xSocialWorlds.find(item => item.id === id);
    if (!world) return;
    world.name = (document.getElementById('x-world-edit-name')?.value || '未命名世界').trim() || '未命名世界';
    world.description = document.getElementById('x-world-edit-desc')?.value || '';
    world.worldBookIds = getXCheckedValues('x-worldbook-check-list');
    world.characterIds = getXCheckedValues('x-world-character-check-list');
    await saveXSocialData();
    closeXWorldSettings();
    renderXSocialScreen();
}

function renderXCheckList(containerId, items, selectedIds, getName) {
    const box = document.getElementById(containerId);
    if (!box) return;
    if (!items.length) {
        box.innerHTML = '<div class="x-check-item" style="color:#999;">暂无可选项</div>';
        return;
    }
    box.innerHTML = items.map(item => `
        <label class="x-check-item">
            <input type="checkbox" value="${escapeXHtml(item.id)}" ${selectedIds.includes(item.id) ? 'checked' : ''}>
            <span>${escapeXHtml(getName(item))}</span>
        </label>
    `).join('');
}

function getXCheckedValues(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(input => input.value);
}

function createXId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function notifyX(message) {
    if (typeof showToast === 'function') showToast(message);
}

function formatXTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
    return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeXHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}
