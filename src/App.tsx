import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, type Post, type Comment, type PollOption } from './supabase'
import './App.css'

// ─── localStorage helpers ──────────────────────────────────────────────────
function getVotes(): Record<string, 'like' | 'dislike'> {
  try { return JSON.parse(localStorage.getItem('chanonpions_votes') || '{}') }
  catch { return {} }
}
function saveVote(postId: string, vote: 'like' | 'dislike' | null) {
  const v = getVotes()
  if (vote === null) delete v[postId]; else v[postId] = vote
  localStorage.setItem('chanonpions_votes', JSON.stringify(v))
}
function getCommentLikes(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem('chanonpions_comment_likes') || '{}') }
  catch { return {} }
}
function saveCommentLike(id: string, liked: boolean) {
  const v = getCommentLikes()
  if (liked) v[id] = true; else delete v[id]
  localStorage.setItem('chanonpions_comment_likes', JSON.stringify(v))
}
function getPollVotes(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem('chanonpions_poll_votes') || '{}') }
  catch { return {} }
}
function savePollVotes(postId: string, optionIds: string[]) {
  const v = getPollVotes()
  if (optionIds.length === 0) delete v[postId]; else v[postId] = optionIds
  localStorage.setItem('chanonpions_poll_votes', JSON.stringify(v))
}
function timeAgo(dateStr: string): string {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`
  return `hace ${Math.floor(s / 86400)}d`
}

// ─── SVG Icons ─────────────────────────────────────────────────────────────
const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M12 4l8 9h-5v7H9v-7H4z" />
  </svg>
)
const IconArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M12 20l-8-9h5V4h6v7h5z" />
  </svg>
)
const IconComment = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)
const IconPoll = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const IconPen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

// ─── Poll display ──────────────────────────────────────────────────────────
function PollBlock({ postId, allowMultiple, allowChange }: {
  postId: string
  allowMultiple: boolean
  allowChange: boolean
}) {
  const [options, setOptions] = useState<PollOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [votedIds, setVotedIds] = useState<string[]>(() => getPollVotes()[postId] ?? [])

  useEffect(() => {
    supabase.from('poll_options').select('*').eq('post_id', postId)
      .order('position').then(({ data }) => { setOptions(data ?? []); setLoading(false) })
  }, [postId])

  async function handleClick(optionId: string) {
    if (busy) return
    const alreadyVoted = votedIds.includes(optionId)

    if (alreadyVoted) {
      // Quitar voto — solo si allowChange
      if (!allowChange) return
      setBusy(true)
      const next = votedIds.filter(id => id !== optionId)
      setVotedIds(next)
      savePollVotes(postId, next)
      setOptions(prev => prev.map(o => o.id === optionId ? { ...o, votes: Math.max(0, o.votes - 1) } : o))
      await supabase.rpc('unvote_poll_option', { option_id: optionId })
      setBusy(false)
    } else {
      // Agregar voto
      if (!allowMultiple && votedIds.length > 0) {
        // Voto único: si no allowChange está bloqueado; si allowChange cambia la selección
        if (!allowChange) return
        setBusy(true)
        const prev = [...votedIds]
        const next = [optionId]
        setVotedIds(next)
        savePollVotes(postId, next)
        setOptions(o => o.map(opt => {
          if (prev.includes(opt.id)) return { ...opt, votes: Math.max(0, opt.votes - 1) }
          if (opt.id === optionId) return { ...opt, votes: opt.votes + 1 }
          return opt
        }))
        await Promise.all(prev.map(id => supabase.rpc('unvote_poll_option', { option_id: id })))
        await supabase.rpc('vote_poll_option', { option_id: optionId })
        setBusy(false)
      } else {
        // Primer voto o múltiple
        setBusy(true)
        const next = [...votedIds, optionId]
        setVotedIds(next)
        savePollVotes(postId, next)
        setOptions(o => o.map(opt => opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt))
        await supabase.rpc('vote_poll_option', { option_id: optionId })
        setBusy(false)
      }
    }
  }

  if (loading) return null

  const totalVotes = options.reduce((s, o) => s + o.votes, 0)
  const hasVoted = votedIds.length > 0

  return (
    <div className="poll-block">
      <ul className="poll-options">
        {options.map(opt => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
          const isVoted = votedIds.includes(opt.id)
          // bloqueado = ya voté esta opción y no puedo cambiar
          const isLocked = isVoted && !allowChange
          // también bloquea el resto si es voto único ya confirmado sin allowChange
          const isDisabled = busy || isLocked || (!allowMultiple && hasVoted && !isVoted && !allowChange)

          return (
            <li key={opt.id}>
              <button
                className={`poll-option ${isVoted ? 'voted' : ''} ${isDisabled && !busy ? 'locked' : ''}`}
                onClick={() => handleClick(opt.id)}
                disabled={isDisabled}
              >
                {hasVoted && <div className="poll-fill" style={{ width: `${pct}%` }} />}
                <span className="poll-option-text">{opt.text}</span>
                {hasVoted && <span className="poll-pct">{pct}%</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="poll-total">{totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}</p>
    </div>
  )
}

// ─── Comment row ───────────────────────────────────────────────────────────
function CommentRow({ comment, onLikeUpdate }: {
  comment: Comment
  onLikeUpdate: (id: string, likes: number) => void
}) {
  const [liked, setLiked] = useState(() => !!getCommentLikes()[comment.id])
  const [liking, setLiking] = useState(false)

  async function toggleLike() {
    if (liking) return
    setLiking(true)
    if (liked) {
      setLiked(false)
      saveCommentLike(comment.id, false)
      onLikeUpdate(comment.id, Math.max(0, comment.likes - 1))
      await supabase.rpc('decrement_comment_likes', { comment_id: comment.id })
    } else {
      setLiked(true)
      saveCommentLike(comment.id, true)
      onLikeUpdate(comment.id, comment.likes + 1)
      await supabase.rpc('increment_comment_likes', { comment_id: comment.id })
    }
    setLiking(false)
  }

  return (
    <li className="comment">
      <div className="comment-body">
        {comment.content && <p className="comment-content">{comment.content}</p>}
        {comment.image_url && (
          <img src={comment.image_url} className="comment-image" alt="" loading="lazy" />
        )}
        <div className="comment-meta">
          <span className="comment-time">{timeAgo(comment.created_at)}</span>
          <button className={`comment-like-btn ${liked ? 'active' : ''}`} onClick={toggleLike} disabled={liking}>
            <IconArrowUp />
            {comment.likes > 0 && <span>{comment.likes}</span>}
          </button>
        </div>
      </div>
    </li>
  )
}

// ─── Comment section ───────────────────────────────────────────────────────
function CommentSection({ postId, previewComments, onNewComment }: {
  postId: string
  previewComments: Comment[]
  onNewComment: (c: Comment) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('comments').select('*').eq('post_id', postId)
      .order('likes', { ascending: false })
      .then(({ data }) => { setComments(data ?? []); setLoading(false) })
  }, [postId])

  useEffect(() => {
    if (!previewComments.length) return
    setComments(prev => {
      const ids = new Set(prev.map(c => c.id))
      const fresh = previewComments.filter(c => !ids.has(c.id))
      return fresh.length ? [...prev, ...fresh] : prev
    })
  }, [previewComments])

  function updateLike(id: string, likes: number) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c))
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImage(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  function removeImage() {
    setImage(null); setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed && !image) return
    if (sending) return
    setSending(true)

    let image_url: string | null = null
    if (image) {
      const ext = image.name.split('.').pop()
      const filename = `comments/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('post-images').upload(filename, image)
      if (!upErr) {
        image_url = supabase.storage.from('post-images').getPublicUrl(filename).data.publicUrl
      }
    }

    const { data, error } = await supabase.from('comments')
      .insert({ post_id: postId, content: trimmed, image_url }).select().single()
    if (!error && data) {
      setComments(p => [...p, data])
      onNewComment(data)
      setText('')
      removeImage()
    }
    setSending(false)
  }

  const sorted = [...comments].sort((a, b) => b.likes - a.likes)
  const canSubmit = (text.trim().length > 0 || image !== null) && !sending

  return (
    <div className="comments-section">
      <form className="comment-form" onSubmit={submit}>
        {preview && (
          <div className="comment-img-preview-wrap">
            <img src={preview} className="comment-img-preview" alt="preview" />
            <button type="button" className="comment-img-remove" onClick={removeImage}>
              <IconClose />
            </button>
          </div>
        )}
        <div className="comment-input-row">
          <input
            className="comment-input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Agregar un comentario anónimo"
            maxLength={300}
            disabled={sending}
          />
          <label className="comment-img-btn" title="Adjuntar imagen">
            <IconImage />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={handleImage}
            />
          </label>
          <button className="comment-btn" type="submit" disabled={!canSubmit}>
            {sending ? '...' : 'Comentar'}
          </button>
        </div>
      </form>
      {loading ? (
        <p className="comments-empty">Cargando comentarios...</p>
      ) : sorted.length === 0 ? (
        <p className="comments-empty">Sin comentarios aún.</p>
      ) : (
        <ul className="comments-list">
          {sorted.map(c => <CommentRow key={c.id} comment={c} onLikeUpdate={updateLike} />)}
        </ul>
      )}
    </div>
  )
}

// ─── Post card ─────────────────────────────────────────────────────────────
function PostCard({ post, onVoteUpdate }: {
  post: Post
  onVoteUpdate: (id: string, likes: number, dislikes: number) => void
}) {
  const [currentVote, setCurrentVote] = useState<'like' | 'dislike' | null>(() => getVotes()[post.id] ?? null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [voting, setVoting] = useState(false)
  const [topComments, setTopComments] = useState<Comment[]>([])
  const [totalComments, setTotalComments] = useState(0)
  const [newComments, setNewComments] = useState<Comment[]>([])
  const [hasPoll, setHasPoll] = useState(false)

  useEffect(() => {
    supabase.from('comments').select('*').eq('post_id', post.id)
      .order('likes', { ascending: false }).limit(2)
      .then(({ data }) => setTopComments(data ?? []))
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id)
      .then(({ count }) => setTotalComments(count ?? 0))
    supabase.from('poll_options').select('id', { count: 'exact', head: true }).eq('post_id', post.id)
      .then(({ count }) => setHasPoll((count ?? 0) > 0))
  }, [post.id])

  function updateTopLike(id: string, likes: number) {
    setTopComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c))
  }
  function handleNewComment(c: Comment) {
    setNewComments(p => [...p, c])
    setTotalComments(n => n + 1)
  }

  async function handleVote(type: 'like' | 'dislike') {
    if (voting) return
    setVoting(true)
    const isSame = currentVote === type
    const prevVote = currentVote
    const newVote = isSame ? null : type
    setCurrentVote(newVote)
    saveVote(post.id, newVote)

    let newLikes = post.likes
    let newDislikes = post.dislikes
    if (prevVote === 'like') newLikes = Math.max(0, newLikes - 1)
    if (prevVote === 'dislike') newDislikes = Math.max(0, newDislikes - 1)
    if (!isSame) {
      if (type === 'like') newLikes += 1
      if (type === 'dislike') newDislikes += 1
    }
    onVoteUpdate(post.id, newLikes, newDislikes)

    if (prevVote === 'like') await supabase.rpc('decrement_likes', { post_id: post.id })
    if (prevVote === 'dislike') await supabase.rpc('decrement_dislikes', { post_id: post.id })
    if (!isSame) {
      if (type === 'like') await supabase.rpc('increment_likes', { post_id: post.id })
      if (type === 'dislike') await supabase.rpc('increment_dislikes', { post_id: post.id })
    }
    setVoting(false)
  }

  const score = post.likes - post.dislikes
  const hasMore = totalComments > topComments.length

  return (
    <article className="post-card">
      <div className="vote-col">
        <button className={`vote-arrow up ${currentVote === 'like' ? 'active' : ''}`} onClick={() => handleVote('like')} disabled={voting}>
          <IconArrowUp />
        </button>
        <span className={`vote-score ${currentVote === 'like' ? 'up' : currentVote === 'dislike' ? 'down' : ''}`}>
          {score}
        </span>
        <button className={`vote-arrow down ${currentVote === 'dislike' ? 'active' : ''}`} onClick={() => handleVote('dislike')} disabled={voting}>
          <IconArrowDown />
        </button>
      </div>

      <div className="post-body">
        {post.content && <p className="post-content">{post.content}</p>}

        {post.image_url && (
          <img src={post.image_url} className="post-image" alt="" loading="lazy" />
        )}

        {hasPoll && (
          <PollBlock
            postId={post.id}
            allowMultiple={post.poll_multiple}
            allowChange={post.poll_allow_change}
          />
        )}

        {topComments.length > 0 && !commentsOpen && (
          <ul className="comments-preview">
            {topComments.map(c => (
              <CommentRow key={c.id} comment={c} onLikeUpdate={updateTopLike} />
            ))}
            {hasMore && (
              <li>
                <button className="show-more-btn" onClick={() => setCommentsOpen(true)}>
                  Ver los {totalComments} comentarios
                </button>
              </li>
            )}
          </ul>
        )}

        <div className="post-actions">
          <button className={`action-btn ${commentsOpen ? 'active' : ''}`} onClick={() => setCommentsOpen(o => !o)}>
            <IconComment />
            <span>{totalComments} comentario{totalComments !== 1 ? 's' : ''}</span>
          </button>
          <span className="post-time">{timeAgo(post.created_at)}</span>
        </div>

        {commentsOpen && (
          <CommentSection postId={post.id} previewComments={newComments} onNewComment={handleNewComment} />
        )}
      </div>
    </article>
  )
}

// ─── New post modal ─────────────────────────────────────────────────────────
function NewPostModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Post) => void }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showPoll, setShowPoll] = useState(false)
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollMultiple, setPollMultiple] = useState(false)
  const [pollAllowChange, setPollAllowChange] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImage(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }
  function removeImage() {
    setImage(null); setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function togglePoll() {
    setShowPoll(v => !v)
    setPollOptions(['', ''])
    setPollMultiple(false)
    setPollAllowChange(false)
  }
  function updateOption(i: number, val: string) {
    setPollOptions(prev => prev.map((o, idx) => idx === i ? val : o))
  }
  function addOption() {
    if (pollOptions.length < 6) setPollOptions(prev => [...prev, ''])
  }
  function removeOption(i: number) {
    if (pollOptions.length > 2) setPollOptions(prev => prev.filter((_, idx) => idx !== i))
  }

  const validPollOptions = pollOptions.map(o => o.trim()).filter(Boolean)
  const pollValid = !showPoll || validPollOptions.length >= 2
  const canSubmit = (text.trim() || image || (showPoll && validPollOptions.length >= 2)) && pollValid

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || sending) return
    setSending(true)

    let image_url: string | null = null
    if (image) {
      const ext = image.name.split('.').pop()
      const filename = `${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('post-images').upload(filename, image)
      if (!upErr) {
        image_url = supabase.storage.from('post-images').getPublicUrl(filename).data.publicUrl
      }
    }

    const { data, error } = await supabase.from('posts')
      .insert({
        content: text.trim(),
        image_url,
        poll_multiple: showPoll ? pollMultiple : false,
        poll_allow_change: showPoll ? pollAllowChange : false,
      }).select().single()

    if (!error && data) {
      if (showPoll && validPollOptions.length >= 2) {
        await supabase.from('poll_options').insert(
          validPollOptions.map((text, position) => ({ post_id: data.id, text, position }))
        )
      }
      onCreated(data)
      onClose()
    }
    setSending(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Crear post</h2>
          <button className="modal-close" onClick={onClose}><IconClose /></button>
        </div>

        <form onSubmit={submit}>
          <textarea
            className="modal-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="¿Qué estás pensando?"
            maxLength={500}
            autoFocus
            rows={4}
          />

          {preview && (
            <div className="image-preview-wrap">
              <img src={preview} className="image-preview" alt="preview" />
              <button type="button" className="image-remove" onClick={removeImage}><IconClose /></button>
            </div>
          )}

          {showPoll && (
            <div className="poll-editor">
              <p className="poll-editor-label">Opciones de la encuesta</p>
              {pollOptions.map((opt, i) => (
                <div key={i} className="poll-editor-row">
                  <input
                    className="poll-editor-input"
                    value={opt}
                    onChange={e => updateOption(i, e.target.value)}
                    placeholder={`Opción ${i + 1}`}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" className="poll-remove-opt" onClick={() => removeOption(i)}>
                      <IconClose />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button type="button" className="poll-add-opt" onClick={addOption}>
                  + Agregar opción
                </button>
              )}

              <div className="poll-toggles">
                <label className="poll-toggle-row">
                  <span className="poll-toggle-label">
                    <strong>Voto múltiple</strong>
                    <small>Se pueden elegir varias opciones</small>
                  </span>
                  <button
                    type="button"
                    className={`toggle-switch ${pollMultiple ? 'on' : ''}`}
                    onClick={() => setPollMultiple(v => !v)}
                    aria-checked={pollMultiple}
                  />
                </label>
                <label className="poll-toggle-row">
                  <span className="poll-toggle-label">
                    <strong>Voto modificable</strong>
                    <small>Los votantes pueden cambiar su voto</small>
                  </span>
                  <button
                    type="button"
                    className={`toggle-switch ${pollAllowChange ? 'on' : ''}`}
                    onClick={() => setPollAllowChange(v => !v)}
                    aria-checked={pollAllowChange}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <div className="modal-left">
              {!showPoll && (
                <label className="btn-image" title="Adjuntar imagen">
                  <IconImage />
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleImage} />
                </label>
              )}
              <button
                type="button"
                className={`btn-poll ${showPoll ? 'active' : ''}`}
                onClick={togglePoll}
                title="Agregar encuesta"
              >
                <IconPoll />
              </button>
              <span className="char-count">{text.length}/500</span>
            </div>
            <div className="modal-btns">
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-post" disabled={!canSubmit || sending}>
                {sending ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const loadPosts = useCallback(async () => {
    const { data } = await supabase.from('posts').select('*')
      .order('created_at', { ascending: false }).limit(50)
    setPosts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])

  function handleVoteUpdate(id: string, likes: number, dislikes: number) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likes, dislikes } : p))
  }
  function handleNewPost(post: Post) {
    setPosts(prev => [post, ...prev])
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">
            <span className="logo-text">ChANONpions</span>
          </div>
          <button className="header-post-btn" onClick={() => setModalOpen(true)}>
            <IconPen />
            <span>Crear post</span>
          </button>
        </div>
      </header>

      <main className="feed">
        {loading ? (
          <div className="spinner-wrap"><span className="spinner" /></div>
        ) : posts.length === 0 ? (
          <div className="empty-feed">
            <p>No hay posts todavía.</p>
            <button className="empty-btn" onClick={() => setModalOpen(true)}>Crear el primer post</button>
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} onVoteUpdate={handleVoteUpdate} />
          ))
        )}
      </main>

      <button className="fab" onClick={() => setModalOpen(true)} title="Crear post">
        <IconPen />
      </button>

      {modalOpen && (
        <NewPostModal onClose={() => setModalOpen(false)} onCreated={handleNewPost} />
      )}
    </div>
  )
}
