// ==========================================
// store_chat.js - 聊天室统一数据管家
// ==========================================

/**
 * 核心魔法 1：无脑获取当前会话（自动判断私聊/群聊）
 */
function getCurrentChat() {
    if (!currentChatId) return null;
    if (currentChatType === 'private') {
        return db.characters.find(c => c.id === currentChatId);
    } else {
        return db.groups.find(g => g.id === currentChatId);
    }
}

/**
 * 核心魔法 2：无脑获取当前“我”的身份信息（抹平私聊和群聊的数据结构差异）
 */
function getMyIdentity(chat) {
    if (!chat) return null;
    if (currentChatType === 'private') {
        return {
            id: 'user_me',
            realName: chat.myName,
            nickname: chat.myNickname || chat.myName,
            avatar: chat.myAvatar
        };
    } else {
        return {
            id: 'user_me',
            realName: chat.me.realName,
            nickname: chat.me.nickname || chat.me.groupNickname || chat.me.realName,
            avatar: chat.me.avatar
        };
    }
}

function _compactChatForLinkedContext(chat, label, limit = 8) {
    if (!chat) return '';

    const longFavs = (chat.longTermSummaries || [])
        .filter(s => s.isFavorited)
        .slice(-2)
        .map(s => `- ${s.title || '长期总结'}：${s.content || ''}`)
        .join('\n');
    const shortFavs = (chat.memorySummaries || [])
        .filter(s => s.isFavorited)
        .slice(-4)
        .map(s => `- ${s.title || '短期总结'}：${s.content || ''}`)
        .join('\n');

    if (longFavs || shortFavs) {
        return `【${label}】\n${longFavs ? `长期：\n${longFavs}\n` : ''}${shortFavs ? `近期：\n${shortFavs}` : ''}`.trim();
    }

    const recent = (chat.history || [])
        .filter(msg => !msg.isAiIgnore && typeof msg.content === 'string')
        .slice(-limit)
        .map(msg => {
            const role = msg.role === 'user' ? '用户' : 'AI';
            return `${role}: ${msg.content}`;
        })
        .join('\n');

    return recent ? `【${label}】\n${recent}` : '';
}

function buildLinkedPrivateContextForGroup(group) {
    if (!group || !group.linkedPrivateContextEnabled) return '';

    const blocks = (group.members || [])
        .map(member => {
            if (!member.originalCharId) return '';
            const char = db.characters && db.characters.find(c => c.id === member.originalCharId);
            if (!char) return '';
            return _compactChatForLinkedContext(char, `${member.realName || char.realName}的单人聊天近况`, 6);
        })
        .filter(Boolean);

    return blocks.length
        ? `【群聊-单人聊天联动】\n以下内容来自群成员最近的单人聊天或总结。群聊回复时请把它当成各成员的近期经历，不要机械复述。\n${blocks.join('\n\n')}`
        : '';
}

function buildLinkedGroupContextForPrivate(character) {
    if (!character) return '';

    const blocks = (db.groups || [])
        .filter(group => group.linkedPrivateContextEnabled)
        .filter(group => (group.members || []).some(member => member.originalCharId === character.id))
        .map(group => _compactChatForLinkedContext(group, `群聊「${group.name || '未命名群聊'}」近况`, 8))
        .filter(Boolean);

    return blocks.length
        ? `【单人聊天-群聊联动】\n以下内容来自这个角色参与过的群聊。单人聊天回复时请自然考虑这些共同经历，不要机械复述。\n${blocks.join('\n\n')}`
        : '';
}

window.buildLinkedPrivateContextForGroup = buildLinkedPrivateContextForGroup;
window.buildLinkedGroupContextForPrivate = buildLinkedGroupContextForPrivate;
