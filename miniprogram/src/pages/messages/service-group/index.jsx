import PageLoading from '../../../components/PageLoading';
import GroupVoiceInput from '../../../components/GroupVoiceInput';
import GroupVoiceMessage from '../../../components/GroupVoiceMessage';
import { refreshUnreadBadge } from '../../../utils/unreadBadge';
import { manageAiDataConsent } from '../../../utils/aiDataConsent';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Textarea, Image } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { mediaUrl, inAppServiceGroupAPI as api } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import GroupHistory from '../../../components/GroupHistory';
import GroupMaterialUpload from '../../../components/GroupMaterialUpload';
import BackButton from '../../../components/BackButton';
import { returnToPrevious } from '../../../utils/returnToPrevious';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '';

const MessageScroll=process.env.TARO_ENV==='h5'?View:ScrollView;
export default function ServiceGroupPage() {
  const [historyOpen,setHistoryOpen]=useState(false);
  const [quote,setQuote]=useState(null),[quoteMenu,setQuoteMenu]=useState(null),[historyAnchor,setHistoryAnchor]=useState(null);
  const [hasNewMessage,setHasNewMessage]=useState(false);
  const [loadingEarlier,setLoadingEarlier]=useState(false);
  const gesture=useRef(false);
  const userScroll=useRef(false);
  const earlierLock=useRef(false);
  const earlierLoader=useRef(null);
  const openMenu=()=>setHistoryOpen(true);
  const [viewportHeight,setViewportHeight]=useState(null);
  useEffect(()=>{if(process.env.TARO_ENV!=='h5')return;const resize=()=>{setViewportHeight(window.visualViewport?.height||window.innerHeight);};resize();window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);};},[]);
  const { statusBarHeight,totalHeight,menuRect } = useNavBar();
  const safeHeaderTop=process.env.TARO_ENV==='h5'?statusBarHeight:Math.max(totalHeight,menuRect?.bottom||0);
  const [group, setGroup] = useState(null);
  const [groups, setGroups] = useState([]);
  const selectedId = useRef(Taro.getCurrentInstance()?.router?.params?.groupId || '');
  const [older,setOlder]=useState(false);
  const [messages, setMessages] = useState([]);
  const [archived, setArchived] = useState(false);
  const [mentionIds, setMentionIds] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [emojiOpen,setEmojiOpen]=useState(false);
  const emojis=['😊','🙂','😄','🤗','🙏','🤝','👍','👌','💪','❤️','🌹','🌷','🌞','🎉','👏','✅','💐','🍀','☕','🌙'];
  const [voiceMode,setVoiceMode]=useState(false);
  const mentionPosition=useRef(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(true);
  const [scrollTarget, setScrollTarget] = useState('');
  const [unreadAnchor, setUnreadAnchor] = useState('');
  const opened = useRef(false);
  const lastMessage = useRef('');
  const followLatest = useRef(true);
  const paneHeight = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollRequest, setScrollRequest] = useState(null);
  useEffect(() => {
    if (loading || !scrollRequest) return;
    let active = true,observer=null,frame=0;
    const locate = () => {
      if (!active || (scrollRequest.bottom && (gesture.current || !followLatest.current))) return;
      if (process.env.TARO_ENV === 'h5') {
        const pane = document.getElementById('service-group-scroll');
        const target = document.getElementById(scrollRequest.target);
        if (pane && (scrollRequest.bottom || target)) {
          pane.scrollTop = scrollRequest.bottom ? pane.scrollHeight
            : pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - (scrollRequest.offset||0);
          if(scrollRequest.bottom&&!observer&&typeof ResizeObserver!=='undefined') {
            observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(locate);});
            observer.observe(pane);
            const content=document.getElementById('group-message-content');if(content)observer.observe(content);
          }
        }
      } else {
        Taro.createSelectorQuery().select('#service-group-scroll').boundingClientRect(rect => { if (rect) paneHeight.current = rect.height; }).exec();
        if (scrollRequest.bottom) { setScrollTarget(''); setScrollTop(value => value + 100000); }else setScrollTarget(scrollRequest.target);
      }
    };
    Taro.nextTick(locate);
    const timers=(scrollRequest.bottom?[120,350,800,1600]:[120]).map(delay=>setTimeout(locate,delay));
    return () => { active = false;timers.forEach(clearTimeout);observer?.disconnect();if(process.env.TARO_ENV==='h5')cancelAnimationFrame(frame); };

  }, [loading, scrollRequest]);

  useEffect(()=>{
    if(process.env.TARO_ENV!=='h5'||loading||!group)return;
    const pane=document.getElementById('service-group-scroll');if(!pane)return;
    const intent=()=>{userScroll.current=true;followLatest.current=false;setScrollRequest(null);};
    const start=()=>{gesture.current=true;intent();};
    const end=()=>{gesture.current=false;};
    const scroll=()=>{if(!userScroll.current)return;if(pane.scrollTop<24)earlierLoader.current?.();if(gesture.current)return;followLatest.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<16;if(followLatest.current)setHasNewMessage(false);};
    pane.addEventListener('wheel',intent,{passive:true});pane.addEventListener('touchstart',start,{passive:true});pane.addEventListener('touchend',end,{passive:true});pane.addEventListener('touchcancel',end,{passive:true});pane.addEventListener('scroll',scroll,{passive:true});
    return()=>{pane.removeEventListener('wheel',intent);pane.removeEventListener('touchstart',start);pane.removeEventListener('touchend',end);pane.removeEventListener('touchcancel',end);pane.removeEventListener('scroll',scroll);};
  },[loading,group?.id]);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const response = await api.list();
      const available = response.data || [];
      setGroups(available);
      const activeId = selectedId.current;
      const current = available.find(item => String(item.id) === String(activeId)) || null;
      setGroup(current);
      const result = current ? await api.messages(current.id) : { data: [] };
      if (activeId !== selectedId.current) return;
      const rows = result.data || [];
      setMessages(prev=>[...new Map([...prev,...rows].map(m=>[String(m.id),m])).values()].sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)||String(a.id).localeCompare(String(b.id))));
      if(!opened.current)setOlder(!!result.hasMore);
      if (!opened.current && rows.length) {
        opened.current = true;
        setUnreadAnchor(result.firstUnreadMessageId || '');
        setScrollRequest({ target: 'group-msg-' + rows[rows.length - 1].id, bottom: true });
      }
      const latest = rows[rows.length - 1]?.id || '';
      if (latest !== lastMessage.current) {
        if (lastMessage.current && followLatest.current && !gesture.current) setScrollRequest({ target: 'group-msg-' + latest, bottom: true });
        else if(lastMessage.current)setHasNewMessage(true);
        lastMessage.current = latest; refreshUnreadBadge();
      }
      setError('');
    } catch (e) { setError(e.message || '服务群读取失败'); }
    finally { refreshing.current = false; setLoading(false); }
  }, []);

  useDidShow(() => {userScroll.current=false;gesture.current=false;followLatest.current=true;opened.current=false;setVisible(true);if(lastMessage.current)setScrollRequest({target:'group-msg-'+lastMessage.current,bottom:true});refresh();});
  useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible) return;
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [visible, refresh]);

  const openGroup = item => { userScroll.current=false;gesture.current=false;selectedId.current = String(item.id); opened.current = false; lastMessage.current = ''; followLatest.current = true; setUnreadAnchor(''); setScrollRequest(null); setMessages([]); setDraft('');setQuote(null);setQuoteMenu(null); setMentionIds([]); setShowMentions(false); setGroup(item); refresh(); };
  const back = () => { if (group) { selectedId.current = ''; setGroup(null); setMessages([]); refresh(); } else { selectedId.current = ''; returnToPrevious(Taro, { destination: '/pages/chat/index' }); } };
  const loadEarlier = async () => {
    if(earlierLock.current||!older)return;
    earlierLock.current=true;setLoadingEarlier(true);followLatest.current=false;
    const id=selectedId.current,anchorId=messages[0]?.id;
    let offset=0;if(process.env.TARO_ENV==='h5'){const pane=document.getElementById('service-group-scroll'),anchor=document.getElementById('group-msg-'+anchorId);if(pane&&anchor)offset=anchor.getBoundingClientRect().top-pane.getBoundingClientRect().top;}
    try {const result=await api.messages(id,anchorId);if(selectedId.current!==id)return;setOlder(!!result.hasMore);setMessages(prev=>[...new Map([...(result.data||[]),...prev].map(m=>[String(m.id),m])).values()]);setScrollRequest({target:'group-msg-'+anchorId,bottom:false,offset});}
    catch(e){setError(e.message || '历史消息读取失败');}
    finally{earlierLock.current=false;setLoadingEarlier(false);}
  };
  earlierLoader.current=loadEarlier;
  const mentionRoles={familyDoctor:'健康顾问',healthManager:'健管专员',nutritionist:'营养师',medicalAssistant:'就医专员',specialist:'专科医师'};
  const editDraft=event=>{const value=event.detail.value;let at=((process.env.TARO_ENV==='h5'?document.activeElement?.selectionStart:event.detail.cursor)??value.length)-1;if(value.length===draft.length+1){let changed=0;while(changed<draft.length&&value[changed]===draft[changed])changed++;if(value[changed]==='@')at=changed;}setDraft(value);if(value[at]==='@'){mentionPosition.current=at;setShowMentions(true);setEmojiOpen(false);}else{setShowMentions(false);mentionPosition.current=null;}};
  const mentionCandidates = group ? [...group.staff, ...(group.assistant?.id ? [{...group.assistant,name:'小嘉',kind:'ai'}] : [])] : [];
  const send = async () => {
    const content = draft.trim();
    if (!group || !content || busy) return;
    setBusy(true); setError('');
    try {
      await api.send(group.id, content, mentionIds.filter(id=>mentionCandidates.some(p=>String(p.id)===id&&content.includes('@'+p.name))),quote?.id);
      setMentionIds([]);setShowMentions(false);
      setDraft('');setQuote(null);setQuoteMenu(null);
      followLatest.current = true;
      await refresh();
      setScrollRequest({ target: 'group-msg-' + lastMessage.current, bottom: true });
    } catch (e) { setError(e.message || '发送失败，请重试'); }
    finally { setBusy(false); }
  };

  return <View onClick={()=>{setEmojiOpen(false);setQuoteMenu(null);}} style={{ position:'relative',height: process.env.TARO_ENV === 'h5' ? (viewportHeight?viewportHeight+'px':'100vh') : '100vh', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', backgroundColor: colors.background }}>
    <View style={{ padding: `${safeHeaderTop + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', position: 'relative', zIndex: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <BackButton onClick={back} destination={!group ? "/pages/chat/index" : undefined} />
      <Text style={{ color: colors.textPrimary, fontSize: '16px', fontWeight: 700, flex: 1, textAlign: 'center' }}>{group?.name || '我的服务群'}</Text>
      <Text onClick={group?openMenu:undefined} style={{color:colors.primary,fontSize:"24px",padding:"0 6px"}}>{group?"…":""}</Text>
    </View>
    <Text style={{ display: 'block', flexShrink: 0, padding: '10px 16px', color: colors.textMuted, fontSize: '12px' }}>
      {group ? `服务团队：${group.staff.map(person => person.name).join('、')}。团队负责人可查看沟通记录。`
        : '消息由当前服务团队处理，团队负责人可查看沟通记录。'}
    </Text>
    {group?.assistant && <View style={{ display: 'flex', flexShrink: 0, alignItems: 'center', padding: '10px 16px', gap: '10px', background: '#eef9f9' }}>
      <Image src={mediaUrl(group.assistant.avatar)} mode="aspectFill" style={{ width: '44px', height: '44px', borderRadius: '50%' }} />
      <View style={{ flex: 1 }}><Text style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>小嘉｜嘉医汇AI健康管家</Text><Text style={{ fontSize: '11px', color: colors.textMuted }}>人工接待时暂停自动回复，可@小嘉单次协助</Text></View>
      <Text onClick={manageAiDataConsent} style={{ fontSize: '12px', color: colors.primary }}>AI授权</Text>
    </View>}
    {!!error && <Text onClick={refresh} style={{ display: 'block', padding: '10px 16px', color: colors.danger, fontSize: '13px' }}>{error} · 点击重试</Text>}
    {loading ? <PageLoading />
      : !group ? <ScrollView scrollY style={{ flex: 1, height: 0, minHeight: 0, padding: '12px', boxSizing: 'border-box' }}>
        <View style={{display:'flex',gap:'16px',padding:'8px'}}><Text onClick={()=>setArchived(false)} style={{fontWeight:archived?400:700}}>服务中</Text><Text onClick={()=>setArchived(true)} style={{fontWeight:archived?700:400}}>已归档</Text></View>
        {groups.filter(item=>archived ? item.status==='closed' : item.status!=='closed').map(item => <View key={item.id} onClick={() => openGroup(item)} style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
          <Text style={{ display: 'block', fontWeight: 700 }}>{item.name || '我的服务群'}{item.status==='closed'?' · 已归档':''} › {item.mentionCount>0&&<Text style={{color:'#B42318'}}>有人@我 </Text>} {item.unreadCount > 0 && <Text style={{ color: '#DC3545' }}>● {item.unreadCount} 条未读</Text>}</Text>
          <Text style={{ display: 'block', color: colors.textMuted, fontSize: '12px', marginTop: '6px' }}>{item.staff.map(person => person.name).join('、')}</Text>
          <Text style={{ display: 'block', color: colors.textMuted, fontSize: '12px', marginTop: '6px' }}>{item.preview || '暂无消息'}</Text>
        </View>)}
        {groups.length === 0 && <Text>健管专员尚未为您配置服务群，请联系服务团队。</Text>}
      </ScrollView>
      : <>
        <MessageScroll id="service-group-scroll" onScrollToUpper={loadEarlier} {...(process.env.TARO_ENV==='h5'?{}:{scrollY:true,scrollTop,scrollIntoView:scrollTarget})}
          onScroll={event => { const detail = event.detail; if (process.env.TARO_ENV === 'h5') { const pane = document.getElementById('service-group-scroll'); if (pane && userScroll.current && !gesture.current) followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 16; } else { followLatest.current = paneHeight.current > 0 && detail.scrollHeight - detail.scrollTop - paneHeight.current < 64; } }}
          style={{ flex:1,height:0,minHeight:0,overflowY:'auto',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain',padding:'12px 16px 24px',boxSizing:'border-box' }}>
          <View id="group-message-content">
          {older&&<Text onClick={loadEarlier} style={{display:'block',textAlign:'center',padding:'10px',color:colors.primary}}>{loadingEarlier?"正在加载…":"查看更早消息"}</Text>}
          {messages.map(message => <View onClick={event=>event.stopPropagation()} onLongPress={()=>group.status!=='closed'&&setQuoteMenu(message)} id={`group-msg-${message.id}`} key={message.id} style={{ maxWidth: '85%', marginBottom: '10px', marginLeft: message.senderType === 'customer' ? 'auto' : 0,
            padding: '10px 12px', borderRadius: `${radius.sm}px`, backgroundColor: message.senderType === 'customer' ? '#D8EFE4' : '#fff' }}>
            {quoteMenu?.id===message.id&&<View onClick={event=>event.stopPropagation()} style={{padding:'8px 10px',marginTop:'8px',borderRadius:'6px',background:'#34473f',color:'#fff',display:'flex',gap:'24px',width:'fit-content'}}><Text onClick={()=>{setQuote(message);setQuoteMenu(null);}}>引用</Text><Text onClick={()=>setQuoteMenu(null)}>取消</Text></View>}
            {String(unreadAnchor) === String(message.id) && <Text style={{ display: 'block', color: '#B42318', fontSize: '12px', marginBottom: '6px' }}>以下为未读消息</Text>}
            {message.senderAvatar && <Image src={mediaUrl(message.senderAvatar)} mode="aspectFill" style={{ width: '36px', height: '36px', borderRadius: '50%', marginBottom: '5px' }} />}
            <Text style={{ display: 'block', color: colors.textMuted, fontSize: '11px' }}>{message.senderName}{message.senderType !== 'customer' && ` · ${({familyDoctor:'健康顾问',nutritionist:'营养师',healthManager:'健管专员',medicalAssistant:'就医专员',specialist:'专科医师',ai:'嘉医汇AI健康管家'})[message.senderRole] || '服务人员'}`} · {stamp(message.createdAt)}</Text>
            {!!message.mentions?.length&&<View style={{display:'flex',flexWrap:'wrap',gap:'5px',marginTop:'6px'}}>{message.mentions.filter(person=>!person.name || !String(message.content || '').includes('@'+person.name)).map(p=><Text key={p.id} onClick={()=>Taro.showModal({title:p.name,content:p.role || '服务成员',showCancel:false})} style={{color:'#187e87',fontSize:'12px',padding:'3px',background:'#eaf8f8'}}>@{p.name}</Text>)}</View>}
            <Text style={{ display: 'block', marginTop: '4px', color: colors.textPrimary, fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{message.audioUrl?'':message.content}</Text>
            {message.quote&&<Text onClick={()=>{if(message.quote.id){setHistoryAnchor(message.quote.id);setHistoryOpen(true);}}} style={{display:'block',padding:'8px',background:'#eef1ef',fontSize:'12px',color:colors.textMuted}}>{message.quote.senderName?message.quote.senderName+'：':''}{message.quote.content}</Text>}
            {message.audioUrl&&<GroupVoiceMessage message={message} groupId={group.id}/>}
            {message.material && <View style={{marginTop:'8px'}}>
              <Text style={{display:'block',fontSize:'12px',color:colors.textMuted}}>{message.material.status}</Text>
              {(message.material.files||[]).map((url,i)=>message.material.mimeType==='application/pdf'
                ? <Text key={i} style={{display:'block',padding:'8px',color:colors.primary}} onClick={async()=>{try{if(process.env.TARO_ENV==='h5')window.location.assign(url);else{const file=await Taro.downloadFile({url});await Taro.openDocument({filePath:file.tempFilePath,fileType:'pdf'});}}catch{Taro.showToast({title:'原件打开失败，请重试',icon:'none'});}}}>查看PDF原件</Text>
                : <Image key={i} src={url} mode="widthFix" onClick={()=>Taro.previewImage({current:url,urls:message.material.files})} style={{width:'100px',margin:'6px',borderRadius:'6px'}} />)}
            </View>}
          </View>)}
          </View>
        </MessageScroll>
        <View style={{position:"relative",flexShrink:0}}>{hasNewMessage&&<Text onClick={()=>{setHasNewMessage(false);followLatest.current=true;setScrollRequest({target:"group-msg-"+lastMessage.current,bottom:true});}} style={{position:"absolute",right:"12px",bottom:"8px",padding:"8px 12px",background:"#fff",borderRadius:"8px",color:colors.primary,fontSize:"12px",boxShadow:"0 2px 8px #0002"}}>↓ 有新消息</Text>}</View>
        {group.status==='closed' ? <Text style={{padding:'16px',background:'#fff',color:colors.textMuted}}>本次服务已结束，历史记录仅供查看。</Text> : <>
        {quote&&<View style={{padding:'8px',background:'#eef1ef',display:'flex',gap:'10px'}}><Text style={{flex:1,fontSize:'12px'}}>{quote.senderName}：{quote.audioUrl?'[语音消息]':quote.content.slice(0,120)}</Text><Text onClick={()=>setQuote(null)}>取消引用</Text></View>}
        <GroupMaterialUpload key={group.id} groupId={group.id} onSent={()=>{followLatest.current=true;refresh();}} />
        {emojiOpen&&<View onClick={event=>event.stopPropagation()} style={{display:'flex',flexWrap:'wrap',flexShrink:0,padding:'8px',background:'#fff'}}>{emojis.map(emoji=><Text key={emoji} onClick={()=>setDraft(text=>(text+emoji).slice(0,2000))} style={{fontSize:'24px',padding:'8px'}}>{emoji}</Text>)}</View>}
        {showMentions&&<ScrollView scrollY style={{flexShrink:0,height:Math.min(160,mentionCandidates.length*44+16)+'px',maxHeight:'160px',background:'#fff',padding:'8px',boxSizing:'border-box'}}>{mentionCandidates.map(p=><View key={p.id} onClick={()=>{setMentionIds(ids=>[...new Set([...ids,String(p.id)])]);setDraft(text=>{const at=mentionPosition.current;return at!=null&&text[at]==='@'?text.slice(0,at)+'@'+p.name+' '+text.slice(at+1):text+'@'+p.name+' ';});setShowMentions(false);}} style={{padding:'10px',color:colors.primary}}>@{p.name}{' · '+(p.kind==='ai'?'AI健康管家':mentionRoles[p.role]||'服务人员')}</View>)}</ScrollView>}
        <View style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '10px', backgroundColor: '#fff' }}>
          <Text aria-label={voiceMode?'切换到键盘':'切换到语音'} onClick={()=>{setVoiceMode(v=>!v);setShowMentions(false);setEmojiOpen(false);}} style={{padding:'8px',fontSize:'24px',lineHeight:'28px',color:colors.primary,flexShrink:0}}>{voiceMode?'⌨':'🎙'}</Text>
          {voiceMode?<GroupVoiceInput key={group.id} groupId={group.id} quotedMessageId={quote?.id} onSent={()=>{setQuote(null);followLatest.current=true;refresh();}} onText={text=>{setDraft(old=>old+text);setVoiceMode(false);}}/>:<Textarea value={draft} showConfirmBar={false} confirmType='send' onConfirm={send} onFocus={()=>setEmojiOpen(false)} onClick={()=>setEmojiOpen(false)} onInput={editDraft} maxlength={2000} autoHeight
            placeholder="给服务团队发消息" style={{ flex: 1, minHeight: '38px', maxHeight: '100px', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: `${radius.xs}px` }} />}
          <Text onClick={event=>{event.stopPropagation();if(!emojiOpen){if(process.env.TARO_ENV==='h5')document.activeElement?.blur?.();else Taro.hideKeyboard().catch(()=>{});}setEmojiOpen(v=>!v);setVoiceMode(false);setShowMentions(false);}} style={{padding:'8px',fontSize:'22px',flexShrink:0}}>☺</Text>
          {!voiceMode&&<View onClick={send} style={{ padding: '10px 14px', backgroundColor: busy || !draft.trim() ? colors.textMuted : colors.primary, borderRadius: `${radius.xs}px` }}>
            <Text style={{ color: '#fff' }}>发送</Text>
          </View>}
        </View>
        </>}
      </>}
    {historyOpen&&group&&<GroupHistory key={group.id} topInset={safeHeaderTop} initialMessageId={historyAnchor} group={group} onClose={()=>{setHistoryOpen(false);setHistoryAnchor(null);}}/>}
  </View>;
}
