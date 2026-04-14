import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, type Post, type Comment } from './supabase'
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
        <p className="comment-content">{comment.content}</p>
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
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const { data, error } = await supabase.from('comments')
      .insert({ post_id: postId, content: trimmed }).select().single()
    if (!error && data) { setComments(p => [...p, data]); onNewComment(data); setText('') }
    setSending(false)
  }

  const sorted = [...comments].sort((a, b) => b.likes - a.likes)

  return (
    <div className="comments-section">
      <form className="comment-form" onSubmit={submit}>
        <input
          className="comment-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Agregar un comentario anónimo"
          maxLength={300}
          disabled={sending}
        />
        <button className="comment-btn" type="submit" disabled={!text.trim() || sending}>
          {sending ? '...' : 'Comentar'}
        </button>
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

  useEffect(() => {
    supabase.from('comments').select('*').eq('post_id', post.id)
      .order('likes', { ascending: false }).limit(2)
      .then(({ data }) => setTopComments(data ?? []))
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id)
      .then(({ count }) => setTotalComments(count ?? 0))
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
      {/* Vote column */}
      <div className="vote-col">
        <button
          className={`vote-arrow up ${currentVote === 'like' ? 'active' : ''}`}
          onClick={() => handleVote('like')}
          disabled={voting}
          title="Upvote"
        >
          <IconArrowUp />
        </button>
        <span className={`vote-score ${currentVote === 'like' ? 'up' : currentVote === 'dislike' ? 'down' : ''}`}>
          {score}
        </span>
        <button
          className={`vote-arrow down ${currentVote === 'dislike' ? 'active' : ''}`}
          onClick={() => handleVote('dislike')}
          disabled={voting}
          title="Downvote"
        >
          <IconArrowDown />
        </button>
      </div>

      {/* Post body */}
      <div className="post-body">
        <p className="post-content">{post.content}</p>

        {post.image_url && (
          <img src={post.image_url} className="post-image" alt="" loading="lazy" />
        )}

        {/* Top comments preview */}
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

        {/* Action bar */}
        <div className="post-actions">
          <button
            className={`action-btn ${commentsOpen ? 'active' : ''}`}
            onClick={() => setCommentsOpen(o => !o)}
          >
            <IconComment />
            <span>{totalComments} comentario{totalComments !== 1 ? 's' : ''}</span>
          </button>
          <span className="post-time">{timeAgo(post.created_at)}</span>
        </div>

        {commentsOpen && (
          <CommentSection
            postId={post.id}
            previewComments={newComments}
            onNewComment={handleNewComment}
          />
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && !image) || sending) return
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
      .insert({ content: trimmed || '', image_url }).select().single()
    if (!error && data) { onCreated(data); onClose() }
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
            rows={5}
          />

          {preview && (
            <div className="image-preview-wrap">
              <img src={preview} className="image-preview" alt="preview" />
              <button type="button" className="image-remove" onClick={removeImage}><IconClose /></button>
            </div>
          )}

          <div className="modal-footer">
            <div className="modal-left">
              <label className="btn-image" title="Adjuntar imagen">
                <IconImage />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleImage} />
              </label>
              <span className="char-count">{text.length}/500</span>
            </div>
            <div className="modal-btns">
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-post" disabled={(!text.trim() && !image) || sending}>
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
