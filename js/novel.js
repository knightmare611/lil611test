let currentNovelStoryId = null;
let currentNovelChapterIndex = 0;
let currentNovelStyleId = null;
const novelGenerationJobs = new Map();
const novelRewriteDrafts = new Map();
let novelRewriteContext = null;
let novelChapterCommitQueue = Promise.resolve();

const DEFAULT_NOVEL_WRITING_STYLES = [
    {
        id: 'style_green_river_serial',
        name: '绿江连载感',
        prompt: `使用第三人称有限视角叙事，镜头贴近主要角色，但不要使用第一人称作为叙述视角。
语言轻盈、细腻，有连载小说的钩子感；重视人物关系的拉扯、对话里的潜台词和章节末尾的余韵。
正文以自然段推进，动作、对白、心理描写交错出现，不写大纲，不写作者解释。`
    },
    {
        id: 'style_delicate_emotion',
        name: '细腻情感',
        prompt: `使用第三人称有限视角叙事，镜头贴近人物内心，但不要使用第一人称作为叙述视角。
重点描写情绪的细微变化、欲言又止的停顿、身体反应和关系里的拉扯。
对白要有潜台词，少用直白解释；用动作和细节表现心动、犹豫、试探、失落或靠近。`
    },
    {
        id: 'style_serious_plot',
        name: '正剧剧情',
        prompt: `使用第三人称叙事，语气稳重，重视事件推进、人物选择和因果逻辑。
每章需要有明确的剧情节点、冲突或信息增量，不要停留在单纯抒情。
角色行动要符合人设与局势，情绪表达克制但有分量，适合主线、权谋、悬疑或现实向剧情。`
    },
    {
        id: 'style_easy_daily',
        name: '轻松日常',
        prompt: `使用第三人称叙事，语言自然轻快，像轻松连载日常。
重点写生活细节、轻微误会、玩笑、陪伴感和角色之间舒服的互动。
节奏不要沉重，不要过度煽情；每章可以围绕一个小事件自然展开，并留下温柔或有趣的余味。`
    },
    {
        id: 'style_stream_of_consciousness',
        name: '意识流',
        prompt: `使用第三人称叙事，可以贴近人物感官和意识流动，但不要改成第一人称叙述。
允许时间、回忆、感官印象和现实场景交错，但读者仍应能理解人物正在经历什么。
语言可以更诗性、更碎片化，重点呈现情绪、联想、潜意识和无法直说的关系张力。`
    }
];

const LEGACY_DEFAULT_NOVEL_STYLE_IDS = new Set([
    'style_light_novel',
    'style_classic_group',
    'style_urban_suspense',
    'style_cyber_fantasy'
]);

function getNovelStories() {
    if (!Array.isArray(db.novelStories)) db.novelStories = [];
    return db.novelStories;
}

function getNovelWritingStyles() {
    if (!Array.isArray(db.novelWritingStyles)) db.novelWritingStyles = [];
    const beforeCleanup = db.novelWritingStyles.length;
    db.novelWritingStyles = db.novelWritingStyles.filter(style => !LEGACY_DEFAULT_NOVEL_STYLE_IDS.has(style.id));
    const existingIds = new Set(db.novelWritingStyles.map(style => style.id));
    let changed = db.novelWritingStyles.length !== beforeCleanup;
    DEFAULT_NOVEL_WRITING_STYLES.forEach(style => {
        if (!existingIds.has(style.id)) {
            db.novelWritingStyles.push({ ...style });
            changed = true;
        }
    });
    if (!db.novelWritingStyles.length) {
        db.novelWritingStyles = DEFAULT_NOVEL_WRITING_STYLES.map(style => ({ ...style }));
        changed = true;
    }
    if (changed && typeof saveGlobalKeys === 'function') saveGlobalKeys(['novelWritingStyles']);
    return db.novelWritingStyles;
}

function getNovelStyleByIdOrName(styleIdOrName) {
    const styles = getNovelWritingStyles();
    return styles.find(style => style.id === styleIdOrName)
        || styles.find(style => style.name === styleIdOrName)
        || styles[0];
}

function createNovelId() {
    return `novel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultNovelStory() {
    const story = {
        id: createNovelId(),
        title: '未命名作品',
        premise: '',
        style: 'style_green_river_serial',
        worldBookIds: [],
        characterIds: [],
        chatSourceIds: [],
        chapters: [],
        updatedAt: Date.now()
    };
    getNovelStories().unshift(story);
    currentNovelStoryId = story.id;
    currentNovelChapterIndex = 0;
    return story;
}

async function saveNovelStories() {
    if (typeof saveGlobalKeys === 'function') await saveGlobalKeys(['novelStories']);
}

async function saveNovelWritingStyles() {
    if (typeof saveGlobalKeys === 'function') await saveGlobalKeys(['novelWritingStyles']);
}

function getCurrentNovelStory() {
    const stories = getNovelStories();
    if (!stories.length) return createDefaultNovelStory();
    let story = stories.find(item => item.id === currentNovelStoryId);
    if (!story) {
        story = stories[0];
        currentNovelStoryId = story.id;
    }
    story.chapters = Array.isArray(story.chapters) ? story.chapters : [];
    story.worldBookIds = Array.isArray(story.worldBookIds) ? story.worldBookIds : [];
    story.characterIds = Array.isArray(story.characterIds) ? story.characterIds : [];
    story.chatSourceIds = Array.isArray(story.chatSourceIds) ? story.chatSourceIds : (story.chatSourceId ? [story.chatSourceId] : []);
    story.style = getNovelStyleByIdOrName(story.style)?.id || 'style_green_river_serial';
    return story;
}

function setupNovelFeature() {
    getNovelWritingStyles();
    bindNovelButton('novel-new-story-btn', async () => {
        createDefaultNovelStory();
        await saveNovelStories();
        renderNovelScreen();
        openNovelSettings();
    });
    bindNovelButton('novel-reader-back-btn', () => {
        if (typeof switchScreen === 'function') switchScreen('rpg-title-screen');
        renderNovelScreen();
    });
    bindNovelButton('novel-open-settings-btn', openNovelSettings);
    bindNovelButton('novel-save-settings-btn', async () => {
        persistNovelSettingsForm();
        await saveNovelStories();
        closeNovelSettings();
        renderNovelScreen();
        renderNovelReader();
        showToast('作品设定已保存');
    });
    bindNovelButton('novel-delete-story-btn', deleteCurrentNovelStory);
    bindNovelButton('novel-open-style-library-btn', openNovelStyleLibrary);
    bindNovelButton('novel-style-back-btn', () => {
        if (typeof switchScreen === 'function') switchScreen('rpg-title-screen');
        renderNovelScreen();
    });
    bindNovelButton('novel-style-add-btn', openNewNovelStyleEditor);
    bindNovelButton('novel-style-new-inline-btn', openNewNovelStyleEditor);
    bindNovelButton('novel-style-edit-inline-btn', () => {
        const styleId = document.getElementById('novel-style-select')?.value || getCurrentNovelStory().style;
        openNovelStyleEditor(styleId);
    });
    bindNovelButton('novel-style-manager-close-btn', closeNovelStyleManager);
    bindNovelButton('novel-style-save-btn', saveCurrentNovelWritingStyle);
    bindNovelButton('novel-style-delete-btn', deleteCurrentNovelWritingStyle);
    bindNovelChange('novel-style-select', () => {
        updateNovelStylePreview();
    });
    bindNovelButton('gr-menu-btn', openNovelChapterList);
    bindNovelButton('gr-sidebar-overlay', closeNovelChapterList);
    bindNovelButton('gr-prev-chapter-btn', () => moveNovelChapter(-1));
    bindNovelButton('gr-next-chapter-btn', () => moveNovelChapter(1));
    bindNovelButton('gr-generate-btn', () => generateNextNovelChapter(false));
    bindNovelButton('gr-reroll-btn', () => generateNextNovelChapter(true));
}

function bindNovelButton(id, handler) {
    const el = document.getElementById(id);
    if (!el || el.dataset.novelBound) return;
    el.dataset.novelBound = '1';
    el.addEventListener('click', handler);
}

function bindNovelChange(id, handler) {
    const el = document.getElementById(id);
    if (!el || el.dataset.novelChangeBound) return;
    el.dataset.novelChangeBound = '1';
    el.addEventListener('change', handler);
}

function renderNovelScreen() {
    setupNovelFeature();
    if (!getNovelStories().length) createDefaultNovelStory();
    renderNovelStoryList();
}

function openNovelStyleLibrary() {
    renderNovelStyleLibrary();
    if (typeof switchScreen === 'function') switchScreen('novel-style-screen');
}

function renderNovelStyleLibrary() {
    const list = document.getElementById('novel-style-library-list');
    if (!list) return;
    const styles = getNovelWritingStyles();
    list.innerHTML = styles.map(style => `
        <article class="gr-author-item" data-style-id="${escapeNovelHtml(style.id)}">
            <div class="gr-author-info">
                <h3>${escapeNovelHtml(style.name)}</h3>
                <p>${escapeNovelHtml(style.prompt || '暂无文风描述')}</p>
            </div>
            <div class="gr-author-actions">
                <button type="button" class="gr-mini-btn novel-style-edit-btn">编辑</button>
            </div>
        </article>
    `).join('');
    list.querySelectorAll('.novel-style-edit-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const item = event.target.closest('.gr-author-item');
            openNovelStyleEditor(item?.dataset.styleId);
        });
    });
}

function renderNovelStoryList() {
    const list = document.getElementById('novel-story-list');
    if (!list) return;
    const stories = getNovelStories();
    if (!stories.length) {
        list.innerHTML = '<div class="novel-empty-state">还没有作品，点击右上角新建。</div>';
        return;
    }
    list.innerHTML = stories.map(story => `
        <article class="gr-book-card" data-novel-id="${escapeNovelHtml(story.id)}">
            <div>
                <div class="gr-book-title">${escapeNovelHtml(story.title || '未命名作品')}</div>
                <div class="gr-book-meta">${story.chapters?.length || 0} 章<br>${escapeNovelHtml(getNovelStyleByIdOrName(story.style)?.name || '绿江连载感')}<br>${formatNovelTime(story.updatedAt)}</div>
            </div>
            <button type="button" class="gr-add-shelf-btn">开始阅读</button>
        </article>
    `).join('');
    list.querySelectorAll('.gr-book-card').forEach(card => {
        card.addEventListener('click', () => {
            currentNovelStoryId = card.dataset.novelId;
            const story = getCurrentNovelStory();
            currentNovelChapterIndex = Math.max(0, story.chapters.length - 1);
            if (typeof switchScreen === 'function') switchScreen('novel-reader-screen');
            renderNovelReader();
        });
    });
}

function renderNovelReader() {
    setupNovelFeature();
    const story = getCurrentNovelStory();
    if (currentNovelChapterIndex >= story.chapters.length) currentNovelChapterIndex = Math.max(0, story.chapters.length - 1);

    const bookName = document.getElementById('gr-book-name-display');
    const chapterTitle = document.getElementById('gr-chapter-title-display');
    const content = document.getElementById('gr-reader-content');
    const prevBtn = document.getElementById('gr-prev-chapter-btn');
    const nextBtn = document.getElementById('gr-next-chapter-btn');

    if (bookName) bookName.textContent = story.title || '未命名作品';
    if (chapterTitle) chapterTitle.textContent = story.chapters.length ? `第 ${currentNovelChapterIndex + 1} 章` : '尚未开篇';
    if (prevBtn) prevBtn.disabled = currentNovelChapterIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentNovelChapterIndex >= story.chapters.length - 1;
    updateNovelGenerationButtons();

    if (!content) return;
    const chapter = story.chapters[currentNovelChapterIndex];
    if (!chapter) {
        content.innerHTML = `<div class="gr-chapter"><span class="gr-chapter-title-large">尚未开篇</span>在下方输入剧情走向，点击“续写”生成第一章。右上角齿轮可以勾选世界观、角色和联动聊天。</div>`;
        return;
    }
    content.innerHTML = `
        <article class="gr-chapter">
            <span class="gr-chapter-title-large">${escapeNovelHtml(chapter.title || `第 ${currentNovelChapterIndex + 1} 章`)}</span>
            ${chapter.summary ? `<div class="gr-summary-card">${escapeNovelHtml(chapter.summary)}</div>` : ''}
            ${escapeNovelHtml(chapter.content || '')}
        </article>
    `;
}

function openNovelSettings() {
    const story = getCurrentNovelStory();
    const title = document.getElementById('novel-title-input');
    const premise = document.getElementById('novel-premise-input');
    const style = document.getElementById('novel-style-select');
    if (title) title.value = story.title || '未命名作品';
    if (premise) premise.value = story.premise || '';
    renderNovelStyleSelect();
    if (style) style.value = story.style || 'style_green_river_serial';
    updateNovelStylePreview();
    renderNovelCheckboxes();
    document.getElementById('novel-settings-modal')?.classList.add('visible');
}

function closeNovelSettings() {
    document.getElementById('novel-settings-modal')?.classList.remove('visible');
}

function renderNovelCheckboxes() {
    const story = getCurrentNovelStory();
    renderCheckList('novel-worldbook-check-list', db.worldBooks || [], story.worldBookIds, book => book.name || '未命名世界书');
    const characters = [
        ...(db.characters || []).map(char => ({ ...char, novelLabel: `角色：${char.realName || char.remarkName || '未命名角色'}` })),
        ...(db.userPersonas || []).map(persona => ({ ...persona, id: `user:${persona.id}`, novelLabel: `user 人设：${persona.realName || persona.nickname || '未命名人设'}${persona.nickname && persona.realName && persona.nickname !== persona.realName ? `（${persona.nickname}）` : ''}` }))
    ];
    renderCheckList('novel-character-check-list', characters, story.characterIds, item => item.novelLabel);
    const chatSources = [
        ...(db.characters || []).map(char => ({ id: `private:${char.id}`, name: `单聊：${char.realName || char.remarkName || '未命名角色'}` })),
        ...(db.groups || []).map(group => ({ id: `group:${group.id}`, name: `群聊：${group.name || '未命名群聊'}` }))
    ];
    renderCheckList('novel-chat-check-list', chatSources, story.chatSourceIds, item => item.name);
    updateNovelSelectionCounts();
}

function renderNovelStyleSelect() {
    const select = document.getElementById('novel-style-select');
    if (!select) return;
    select.innerHTML = getNovelWritingStyles().map(style => `
        <option value="${escapeNovelHtml(style.id)}">${escapeNovelHtml(style.name)}</option>
    `).join('');
}

function updateNovelStylePreview() {
    const select = document.getElementById('novel-style-select');
    const preview = document.getElementById('novel-style-preview-input');
    if (!preview) return;
    const style = getNovelStyleByIdOrName(select?.value || getCurrentNovelStory().style);
    preview.value = style?.prompt || '';
}

function renderCheckList(containerId, items, selectedIds, getName) {
    const box = document.getElementById(containerId);
    if (!box) return;
    if (!items.length) {
        box.innerHTML = '<div class="gr-checkbox-item" style="color:#999;">暂无可选项</div>';
        return;
    }
    box.innerHTML = items.map(item => `
        <label class="gr-checkbox-item">
            <input type="checkbox" value="${escapeNovelHtml(item.id)}" ${selectedIds.includes(item.id) ? 'checked' : ''}>
            <span>${escapeNovelHtml(getName(item))}</span>
        </label>
    `).join('');
    box.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.closest('.gr-checkbox-item')?.classList.toggle('checked', input.checked);
        input.addEventListener('change', () => {
            input.closest('.gr-checkbox-item')?.classList.toggle('checked', input.checked);
            updateNovelSelectionCounts();
        });
    });
}

function updateNovelSelectionCounts() {
    const pairs = [
        ['novel-worldbook-check-list', 'novel-worldbook-count'],
        ['novel-character-check-list', 'novel-character-count'],
        ['novel-chat-check-list', 'novel-chat-count']
    ];
    pairs.forEach(([listId, countId]) => {
        const count = document.querySelectorAll(`#${listId} input[type="checkbox"]:checked`).length;
        const el = document.getElementById(countId);
        if (el) el.textContent = `已选 ${count}`;
    });
}

function persistNovelSettingsForm() {
    const story = getCurrentNovelStory();
    story.title = (document.getElementById('novel-title-input')?.value || '未命名作品').trim() || '未命名作品';
    story.premise = document.getElementById('novel-premise-input')?.value || '';
    story.style = document.getElementById('novel-style-select')?.value || 'style_green_river_serial';
    const style = getNovelStyleByIdOrName(story.style);
    const previewPrompt = (document.getElementById('novel-style-preview-input')?.value || '').trim();
    if (style && previewPrompt && previewPrompt !== style.prompt) {
        style.prompt = previewPrompt;
        saveNovelWritingStyles();
    }
    story.worldBookIds = getCheckedValues('novel-worldbook-check-list');
    story.characterIds = getCheckedValues('novel-character-check-list');
    story.chatSourceIds = getCheckedValues('novel-chat-check-list');
    story.updatedAt = Date.now();
    return story;
}

function getCheckedValues(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)).map(input => input.value);
}

function openNovelStyleManager() {
    openNovelStyleEditor(getCurrentNovelStory().style);
}

function openNewNovelStyleEditor() {
    currentNovelStyleId = null;
    const title = document.getElementById('novel-style-editor-title');
    const nameInput = document.getElementById('novel-style-name-input');
    const promptInput = document.getElementById('novel-style-prompt-input');
    const deleteBtn = document.getElementById('novel-style-delete-btn');
    if (title) title.textContent = '新增作者';
    if (nameInput) nameInput.value = '';
    if (promptInput) promptInput.value = '使用第三人称叙事，明确角色视角、语言节奏、情绪密度和章节推进方式。';
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('novel-style-manager-modal')?.classList.add('visible');
}

function openNovelStyleEditor(styleId) {
    const style = getNovelStyleByIdOrName(styleId);
    currentNovelStyleId = style?.id || null;
    const title = document.getElementById('novel-style-editor-title');
    const nameInput = document.getElementById('novel-style-name-input');
    const promptInput = document.getElementById('novel-style-prompt-input');
    const deleteBtn = document.getElementById('novel-style-delete-btn');
    if (title) title.textContent = style ? '编辑作者' : '新增作者';
    if (nameInput) nameInput.value = style?.name || '';
    if (promptInput) promptInput.value = style?.prompt || '使用第三人称叙事，明确角色视角、语言节奏、情绪密度和章节推进方式。';
    if (deleteBtn) deleteBtn.style.display = style ? '' : 'none';
    document.getElementById('novel-style-manager-modal')?.classList.add('visible');
}

function closeNovelStyleManager() {
    renderNovelStyleSelect();
    const story = getCurrentNovelStory();
    const select = document.getElementById('novel-style-select');
    if (select) select.value = getNovelStyleByIdOrName(story.style)?.id || currentNovelStyleId || '';
    updateNovelStylePreview();
    renderNovelStyleLibrary();
    document.getElementById('novel-style-manager-modal')?.classList.remove('visible');
}

function renderNovelStyleManager() {
    renderNovelStyleLibrary();
}

async function saveCurrentNovelWritingStyle() {
    const styles = getNovelWritingStyles();
    let style = styles.find(item => item.id === currentNovelStyleId);
    if (!style) {
        style = { id: createNovelId().replace('novel_', 'style_'), name: '', prompt: '' };
        styles.push(style);
        currentNovelStyleId = style.id;
    }
    style.name = (document.getElementById('novel-style-name-input')?.value || '未命名文风').trim() || '未命名文风';
    style.prompt = (document.getElementById('novel-style-prompt-input')?.value || '').trim()
        || '使用第三人称叙事，保持人物行动和情绪变化合理，正文不写大纲。';
    await saveNovelWritingStyles();
    renderNovelStyleLibrary();
    renderNovelStyleSelect();
    const select = document.getElementById('novel-style-select');
    if (select) select.value = style.id;
    getCurrentNovelStory().style = style.id;
    updateNovelStylePreview();
    closeNovelStyleManager();
    showToast('文风已保存');
}

async function deleteCurrentNovelWritingStyle() {
    const styles = getNovelWritingStyles();
    if (styles.length <= 1) {
        showToast('至少保留一个文风');
        return;
    }
    const style = styles.find(item => item.id === currentNovelStyleId);
    if (!style) return;
    const ok = await AppUI.confirm(`确定删除文风「${style.name}」吗？`, '删除文风', '删除', '取消');
    if (!ok) return;
    db.novelWritingStyles = styles.filter(item => item.id !== style.id);
    const fallback = db.novelWritingStyles[0];
    getNovelStories().forEach(story => {
        if (story.style === style.id || story.style === style.name) story.style = fallback.id;
    });
    currentNovelStyleId = fallback.id;
    await saveNovelWritingStyles();
    await saveNovelStories();
    renderNovelStyleLibrary();
    renderNovelStyleSelect();
    updateNovelStylePreview();
    closeNovelStyleManager();
    showToast('文风已删除');
}

async function deleteCurrentNovelStory() {
    const story = getCurrentNovelStory();
    const ok = await AppUI.confirm(`确定删除《${story.title || '未命名作品'}》吗？`, '删除作品', '删除', '取消');
    if (!ok) return;
    db.novelStories = getNovelStories().filter(item => item.id !== story.id);
    currentNovelStoryId = null;
    if (!db.novelStories.length) createDefaultNovelStory();
    await saveNovelStories();
    closeNovelSettings();
    if (typeof switchScreen === 'function') switchScreen('rpg-title-screen');
    renderNovelScreen();
}

function openNovelChapterList() {
    renderNovelChapterList();
    document.getElementById('gr-sidebar-overlay')?.classList.add('visible');
    document.getElementById('gr-chapter-sidebar')?.classList.add('visible');
}

function closeNovelChapterList() {
    document.getElementById('gr-sidebar-overlay')?.classList.remove('visible');
    document.getElementById('gr-chapter-sidebar')?.classList.remove('visible');
}

function renderNovelChapterList() {
    const story = getCurrentNovelStory();
    const total = document.getElementById('gr-total-chapters');
    const list = document.getElementById('gr-chapter-list-content');
    if (total) total.textContent = `共 ${story.chapters.length} 章`;
    if (!list) return;
    if (!story.chapters.length) {
        list.innerHTML = '<div class="gr-sidebar-item">暂无章节</div>';
        return;
    }
    list.innerHTML = story.chapters.map((chapter, index) => `
        <div class="gr-sidebar-item ${index === currentNovelChapterIndex ? 'active' : ''}" data-index="${index}">
            第 ${index + 1} 章 <span>${escapeNovelHtml(chapter.title || '')}</span>
        </div>
    `).join('');
    list.querySelectorAll('.gr-sidebar-item[data-index]').forEach(item => {
        item.addEventListener('click', () => {
            currentNovelChapterIndex = Number(item.dataset.index);
            closeNovelChapterList();
            renderNovelReader();
        });
    });
}

function moveNovelChapter(delta) {
    const story = getCurrentNovelStory();
    currentNovelChapterIndex = Math.min(Math.max(currentNovelChapterIndex + delta, 0), Math.max(0, story.chapters.length - 1));
    renderNovelReader();
}

function updateNovelGenerationButtons() {
    const story = getNovelStories().find(item => item.id === currentNovelStoryId);
    const job = story && novelGenerationJobs.get(story.id);
    const next = document.getElementById('gr-generate-btn');
    const rewrite = document.getElementById('gr-reroll-btn');
    if (next) { next.disabled = !!job; next.textContent = job && !job.isReroll ? '续写中' : '续写'; }
    if (rewrite) { rewrite.disabled = !!job || !story?.chapters?.length; rewrite.textContent = job?.isReroll ? '重写中' : '重写'; }
}

function getNovelRewriteModal() {
    let modal = document.getElementById('novel-rewrite-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'novel-rewrite-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-window novel-settings-window" role="dialog" aria-modal="true" aria-labelledby="novel-rewrite-title">
        <h3 id="novel-rewrite-title"></h3>
        <p id="novel-rewrite-hint" style="font-size:13px;line-height:1.6;color:#777;"></p>
        <label for="novel-rewrite-direction">本章剧情走向</label>
        <textarea id="novel-rewrite-direction" class="gr-input" rows="7" style="width:100%;min-height:140px;max-height:40vh;resize:vertical;" placeholder="重新填写或修改这章的剧情走向..."></textarea>
        <div id="novel-rewrite-mode-row" style="margin-top:12px;">
            <label for="novel-rewrite-mode">重写方式</label>
            <select id="novel-rewrite-mode" class="gr-input" style="width:100%;">
                <option value="branch">从本章开始分支，自动新建一本书</option>
                <option value="replace">替换本章并删除后续章节</option>
            </select>
        </div>
        <p id="novel-rewrite-effect" style="font-size:13px;line-height:1.6;"></p>
        <div class="novel-settings-actions">
            <button type="button" class="btn btn-secondary" id="novel-rewrite-cancel">取消</button>
            <button type="button" class="btn btn-primary" id="novel-rewrite-confirm">确认重写</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    const saveDraft = () => {
        if (novelRewriteContext) novelRewriteDrafts.set(novelRewriteContext.key, document.getElementById('novel-rewrite-direction').value);
    };
    modal.querySelector('#novel-rewrite-direction').addEventListener('input', saveDraft);
    modal.querySelector('#novel-rewrite-mode').addEventListener('change', updateNovelRewriteEffect);
    modal.querySelector('#novel-rewrite-cancel').addEventListener('click', () => { saveDraft(); modal.classList.remove('visible'); });
    modal.addEventListener('click', event => { if (event.target === modal && !novelGenerationJobs.has(novelRewriteContext?.storyId)) { saveDraft(); modal.classList.remove('visible'); } });
    modal.querySelector('#novel-rewrite-confirm').addEventListener('click', () => {
        if (!novelRewriteContext) return;
        saveDraft();
        generateNextNovelChapter(true, { ...novelRewriteContext, direction: modal.querySelector('#novel-rewrite-direction').value, mode: modal.querySelector('#novel-rewrite-mode').value });
    });
    return modal;
}

function updateNovelRewriteEffect() {
    if (!novelRewriteContext) return;
    const branch = document.getElementById('novel-rewrite-mode').value === 'branch';
    document.getElementById('novel-rewrite-effect').textContent = branch
        ? '生成成功后自动在书架新建一本分支作品，保留之前的章节，并从本章开始新剧情。原书完整保留。'
        : `生成成功后替换本章${novelRewriteContext.followingCount ? `，并删除其后的 ${novelRewriteContext.followingCount} 章` : ''}。生成失败会保留原内容。`;
}

function openNovelRewriteDialog() {
    const story = getCurrentNovelStory();
    const chapter = story.chapters[currentNovelChapterIndex];
    if (!chapter || novelGenerationJobs.has(story.id)) return;
    const modal = getNovelRewriteModal();
    const key = `${story.id}:${chapter.id || currentNovelChapterIndex}`;
    novelRewriteContext = { storyId: story.id, chapterIndex: currentNovelChapterIndex, chapterId: chapter.id, key, followingCount: story.chapters.length - currentNovelChapterIndex - 1 };
    modal.querySelector('#novel-rewrite-title').textContent = `重写《${story.title || '未命名作品'}》第 ${currentNovelChapterIndex + 1} 章`;
    modal.querySelector('#novel-rewrite-direction').value = novelRewriteDrafts.has(key) ? novelRewriteDrafts.get(key) : (chapter.direction || '');
    modal.querySelector('#novel-rewrite-hint').textContent = chapter.direction ? '已填入本章上次使用的剧情走向，可修改后重新生成。' : '旧章节未保存原剧情走向，可在这里重新填写。留空则围绕本章原有情节重新创作。';
    modal.querySelector('#novel-rewrite-mode-row').hidden = !novelRewriteContext.followingCount;
    modal.querySelector('#novel-rewrite-mode').value = novelRewriteContext.followingCount ? 'branch' : 'replace';
    modal.querySelector('#novel-rewrite-confirm').disabled = false;
    modal.querySelector('#novel-rewrite-cancel').disabled = false;
    modal.querySelector('#novel-rewrite-direction').disabled = false;
    modal.querySelector('#novel-rewrite-mode').disabled = false;
    updateNovelRewriteEffect();
    modal.classList.add('visible');
}

function commitNovelChapter(job, chapter) {
    const task = novelChapterCommitQueue.then(async () => {
        const stories = getNovelStories();
        const source = stories.find(item => item.id === job.storyId);
        if (!source || JSON.stringify(source.chapters) !== job.chapterSignature) throw new Error('章节已发生变化，本次生成未覆盖原内容，请重新操作。');
        let updated;
        const chapters = job.isReroll ? source.chapters.slice(0, job.chapterIndex).concat(chapter) : source.chapters.concat(chapter);
        if (job.isReroll && job.mode === 'branch') {
            let n = 1;
            let title;
            do { title = `${source.title || '未命名作品'} · 分支${n++}`; } while (stories.some(item => item.title === title));
            updated = { ...JSON.parse(JSON.stringify(job.snapshot)), id: createNovelId(), title, chapters: JSON.parse(JSON.stringify(chapters)), branchSourceId: source.id, branchPoint: job.chapterIndex + 1, updatedAt: Date.now() };
        } else {
            updated = { ...source, chapters, updatedAt: Date.now() };
        }
        const nextStories = updated.id === source.id ? stories.map(item => item.id === source.id ? updated : item) : [updated, ...stories];
        // 生成结果先成功落库，再切换内存状态，存储失败时原章仍完整保留。
        if (typeof dexieDB === 'undefined') throw new Error('存储尚未就绪，请稍后重试。');
        await dexieDB.globalSettings.put({ key: 'novelStories', value: nextStories });
        db.novelStories = nextStories;
        return updated;
    });
    novelChapterCommitQueue = task.catch(() => {});
    return task;
}

async function generateNextNovelChapter(isReroll, rewriteOptions) {
    if (isReroll && !rewriteOptions) return openNovelRewriteDialog();
    const story = isReroll ? getNovelStories().find(item => item.id === rewriteOptions.storyId) : getCurrentNovelStory();
    if (!story || novelGenerationJobs.has(story.id)) return;
    const directionInput = document.getElementById('gr-direction-input');
    const direction = isReroll ? String(rewriteOptions.direction || '') : (directionInput?.value || '');
    const chapterIndex = isReroll ? rewriteOptions.chapterIndex : story.chapters.length;
    if (isReroll && (!story.chapters[chapterIndex] || story.chapters[chapterIndex].id !== rewriteOptions.chapterId)) return showToast('目标章节已变化，请重新打开重写。');
    if (!story.premise && !direction && story.chapters.length === 0) {
        showToast('先写一点剧情走向，或在设定里补充故事基调');
        return;
    }
    const job = { storyId: story.id, chapterIndex, chapterSignature: JSON.stringify(story.chapters), snapshot: JSON.parse(JSON.stringify(story)), isReroll, mode: rewriteOptions?.mode || 'replace' };
    novelGenerationJobs.set(story.id, job);
    updateNovelGenerationButtons();
    const modal = document.getElementById('novel-rewrite-modal');
    if (isReroll && modal) {
        for (const id of ['confirm', 'cancel', 'direction', 'mode']) modal.querySelector(`#novel-rewrite-${id}`).disabled = true;
    }
    try {
        const chapter = await requestNovelChapter(job.snapshot, direction, isReroll, chapterIndex);
        chapter.direction = direction;
        const updated = await commitNovelChapter(job, chapter);
        if (currentNovelStoryId === story.id) {
            currentNovelStoryId = updated.id;
            currentNovelChapterIndex = updated.chapters.length - 1;
            if (!isReroll && directionInput?.value === direction) directionInput.value = '';
        }
        if (isReroll) {
            novelRewriteDrafts.delete(rewriteOptions.key);
            if (novelRewriteContext?.key === rewriteOptions.key) modal?.classList.remove('visible');
        }
        renderNovelReader();
        renderNovelScreen();
        showToast(isReroll ? (job.mode === 'branch' ? `已新建《${updated.title}》` : '本章已重写') : '新章节已生成');
    } catch (error) {
        console.error('小说生成失败:', error);
        showToast(error.message || '生成失败，请检查 API 设置');
    } finally {
        novelGenerationJobs.delete(story.id);
        updateNovelGenerationButtons();
        if (isReroll && modal && novelRewriteContext?.key === rewriteOptions.key) {
            for (const id of ['confirm', 'cancel', 'direction', 'mode']) modal.querySelector(`#novel-rewrite-${id}`).disabled = false;
        }
    }
}

async function requestNovelChapter(story, direction, isReroll, chapterIndex = currentNovelChapterIndex) {
    const api = db.apiSettings || {};
    if (!api.url || !api.key || !api.model) throw new Error('请先在 API 设置中配置地址、密钥和模型，原章节已保留。');
    const prompt = buildNovelPrompt(story, direction, isReroll, chapterIndex);
    const response = await fetch(`${api.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
        body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: prompt }], temperature: 0.85 })
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('API 没有返回小说正文，原章节已保留，请重试。');
    return parseNovelChapter(text);
}

function buildNovelPrompt(story, direction, isReroll, chapterIndex = currentNovelChapterIndex) {
    const preceding = isReroll ? story.chapters.slice(0, chapterIndex) : story.chapters;
    const previous = preceding.slice(-3).map((chapter, index) => `第${Math.max(0, preceding.length - 3) + index + 1}章：${chapter.content}`).join('\n\n');
    const current = isReroll && story.chapters[chapterIndex] ? `\n【待替换的原章草稿，仅作改写参考，不属于前文】\n${story.chapters[chapterIndex].content}` : '';
    const style = getNovelStyleByIdOrName(story.style);
    return `你是绿江连载小说作者。请生成${isReroll ? '重写后的本章' : '下一章'}。
${isReroll ? `当前正在重写第${chapterIndex + 1}章：从本章之前的剧情接起，按用户的新走向重新创作同一章，替换原章。不得接着原章结尾写下一章，不得把原章或其后内容当作已发生的前文。` : ''}
要求：第一行写章节标题，后面写正文；不要解释；不要写大纲；正文约1200到2000字；自然吸收聊天素材。
硬性要求：全文使用第三人称叙事，禁止使用第一人称作为叙述视角；角色说“我”只允许出现在对白中。

作品：${story.title}
文风名称：${style?.name || '绿江连载感'}
【文风要求】
${style?.prompt || '使用第三人称叙事，保持人物行动和情绪变化合理。'}

故事基调：${story.premise || '暂无'}

【世界观】
${getNovelWorldContext(story) || '暂无'}

【角色】
${getNovelCharacterContext(story) || '暂无'}

【联动聊天素材】
${getNovelChatContext(story.chatSourceIds) || '暂无'}

【前文章节】
${previous || '暂无，这是第一章。'}${current}

【用户希望本章走向】
${direction || (isReroll ? '保持本章原有情节阶段与主要事件，重新组织叙述、对话和细节；不要继续到下一章。' : '请自然推进剧情。')}`;
}

function getNovelWorldContext(story) {
    return (db.worldBooks || [])
        .filter(book => story.worldBookIds.includes(book.id))
        .map(book => `${book.name || '世界书'}：${book.content || ''}`.slice(0, 1200))
        .join('\n');
}

function getNovelCharacterContext(story) {
    const characters = (db.characters || [])
        .filter(char => story.characterIds.includes(char.id))
        .map(char => `${char.realName || char.remarkName || '角色'}：${char.persona || ''}`.slice(0, 900));
    const users = (db.userPersonas || [])
        .filter(persona => story.characterIds.includes(`user:${persona.id}`))
        .map(persona => `${persona.realName || persona.nickname || '用户角色'}（user 人设${persona.nickname ? `，昵称：${persona.nickname}` : ''}）：${persona.persona || ''}`.slice(0, 900));
    return characters.concat(users).join('\n');
}

function getNovelChatContext(sourceIds) {
    const ids = Array.isArray(sourceIds) ? sourceIds : [];
    const blocks = ids.map(sourceId => {
        const [type, id] = sourceId.split(':');
        const chat = type === 'group' ? (db.groups || []).find(item => item.id === id) : (db.characters || []).find(item => item.id === id);
        if (!chat || !Array.isArray(chat.history)) return '';
        const nameMap = new Map((db.characters || []).map(char => [char.id, char.realName || char.remarkName || '角色']));
        const title = type === 'group' ? `群聊：${chat.name || '未命名群聊'}` : `单聊：${chat.realName || chat.remarkName || '未命名角色'}`;
        const text = chat.history
            .filter(msg => !msg.isHidden && !msg.isAiIgnore && msg.role !== 'system')
            .slice(-18)
            .map(msg => {
                const who = msg.role === 'user' ? (chat.myName || '我') : (msg.senderName || nameMap.get(msg.senderId) || chat.realName || chat.name || '角色');
                return `${who}：${String(msg.content || '').replace(/\s+/g, ' ').slice(0, 120)}`;
            })
            .join('\n');
        return `【${title}】\n${text}`;
    }).filter(Boolean);
    return blocks.join('\n\n').slice(0, 4200);
}

function parseNovelChapter(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('小说正文为空，请重试。');
    const clean = text.replace(/^#+\s*/gm, '').trim();
    const lines = clean.split(/\n+/);
    let title = lines[0] || '新的章节';
    let content = lines.slice(1).join('\n\n').trim();
    if (!content) {
        title = '新的章节';
        content = clean || '故事在这里轻轻落笔。';
    }
    title = title.replace(/^第[一二三四五六七八九十百千万0-9]+\s*[章节回]?\s*/, '').slice(0, 40);
    return { id: createNovelId(), title, content, summary: '', createdAt: Date.now() };
}

function buildNovelFallbackChapter(story, direction) {
    const title = story.chapters.length ? '余波' : '开篇';
    const content = `这一章的方向已经记下来了：${direction || story.premise || '故事开始缓慢展开'}。\n\n当前还没有可用的 API 设置，所以小说先保存为草稿提示。设置好 API 后，再点击“续写”就能继续写正文。`;
    return { id: createNovelId(), title, content, summary: '', createdAt: Date.now() };
}

function formatNovelTime(timestamp) {
    if (!timestamp) return '未保存';
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function escapeNovelHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}
