import { useState, useEffect, useCallback } from 'react'
import { supabase, type Post, type Comment } from './supabase'
import './App.css'

// ─── localStorage helpers ──────────────────────────────────────────────────
function getVotes(): Record<string, 'like' | 'dislike'> {
  try { return JSON.parse(localStorage.getItem('chanonpions_votes') || '{}') }
  catch { return {} }
}

function saveVote(postId: string, vote: 'like' | 'dislike' | null) {
  const votes = getVotes()
  if (vote === null) delete votes[postId]
  else votes[postId] = vote
  localStorage.setItem('chanonpions_votes', JSON.stringify(votes))
}

function getCommentLikes(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem('chanonpions_comment_likes') || '{}') }
  catch { return {} }
}

function saveCommentLike(commentId: string, liked: boolean) {
  const likes = getCommentLikes()
  if (liked) likes[commentId] = true
  else delete likes[commentId]
  localStorage.setItem('chanonpions_comment_likes', JSON.stringify(likes))
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Single comment row ────────────────────────────────────────────────────
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
      <span className="comment-content">{comment.content}</span>
      <div className="comment-meta">
        <span className="comment-time">{timeAgo(comment.created_at)}</span>
        <button
          className={`comment-like-btn ${liked ? 'active' : ''}`}
          onClick={toggleLike}
          disabled={liking}
        >
          ▲ {comment.likes > 0 ? comment.likes : ''}
        </button>
      </div>
    </li>
  )
}

// ─── Comment section (expanded) ────────────────────────────────────────────
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
    supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('likes', { ascending: false })
      .then(({ data }) => {
        setComments(data ?? [])
        setLoading(false)
      })
  }, [postId])

  // Merge new comments written in this session
  useEffect(() => {
    if (previewComments.length > 0) {
      setComments(prev => {
        const ids = new Set(prev.map(c => c.id))
        const fresh = previewComments.filter(c => !ids.has(c.id))
        return fresh.length > 0 ? [...prev, ...fresh] : prev
      })
    }
  }, [previewComments])

  function updateLike(id: string, likes: number) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, content: trimmed })
      .select()
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      onNewComment(data)
      setText('')
    }
    setSending(false)
  }

  const sorted = [...comments].sort((a, b) => b.likes - a.likes)

  return (
    <div className="comments-section">
      {loading ? (
        <p className="comments-empty">Cargando...</p>
      ) : sorted.length === 0 ? (
        <p className="comments-empty">Sin comentarios aún. ¡Sé el primero!</p>
      ) : (
        <ul className="comments-list">
          {sorted.map(c => (
            <CommentRow key={c.id} comment={c} onLikeUpdate={updateLike} />
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={submit}>
        <input
          className="comment-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Comentar de forma anónima..."
          maxLength={300}
          disabled={sending}
        />
        <button className="comment-btn" type="submit" disabled={!text.trim() || sending}>
          {sending ? '...' : '↩'}
        </button>
      </form>
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

  // Load top 2 comments on mount
  useEffect(() => {
    supabase
      .from('comments')
      .select('*')
      .eq('post_id', post.id)
      .order('likes', { ascending: false })
      .limit(2)
      .then(({ data }) => setTopComments(data ?? []))

    supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .then(({ count }) => setTotalComments(count ?? 0))
  }, [post.id])

  function updateTopLike(id: string, likes: number) {
    setTopComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c))
  }

  function handleNewComment(c: Comment) {
    setNewComments(prev => [...prev, c])
    setTotalComments(n => n + 1)
  }

  async function handleVote(type: 'like' | 'dislike') {
    if (voting) return
    setVoting(true)

    const isSame = currentVote === type
    const prevVote = currentVote

    // Update state & localStorage immediately (optimistic)
    const newVote = isSame ? null : type
    setCurrentVote(newVote)
    saveVote(post.id, newVote)

    // Calculate new counts
    let newLikes = post.likes
    let newDislikes = post.dislikes
    if (prevVote === 'like') newLikes = Math.max(0, newLikes - 1)
    if (prevVote === 'dislike') newDislikes = Math.max(0, newDislikes - 1)
    if (!isSame) {
      if (type === 'like') newLikes += 1
      if (type === 'dislike') newDislikes += 1
    }
    onVoteUpdate(post.id, newLikes, newDislikes)

    // Sync with DB
    if (prevVote === 'like') await supabase.rpc('decrement_likes', { post_id: post.id })
    if (prevVote === 'dislike') await supabase.rpc('decrement_dislikes', { post_id: post.id })
    if (!isSame) {
      if (type === 'like') await supabase.rpc('increment_likes', { post_id: post.id })
      if (type === 'dislike') await supabase.rpc('increment_dislikes', { post_id: post.id })
    }

    setVoting(false)
  }

  const hasMore = totalComments > topComments.length

  return (
    <article className="post-card">
      <p className="post-content">{post.content}</p>

      {post.image_url && (
        <img
          src={post.image_url}
          className="post-image"
          alt=""
          loading="lazy"
        />
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
                Ver los {totalComments} comentarios →
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="post-footer">
        <span className="post-time">{timeAgo(post.created_at)}</span>
        <div className="post-actions">
          <button
            className={`vote-btn like-btn ${currentVote === 'like' ? 'active' : ''}`}
            onClick={() => handleVote('like')}
            disabled={voting}
          >
            ▲ {post.likes}
          </button>
          <button
            className={`vote-btn dislike-btn ${currentVote === 'dislike' ? 'active' : ''}`}
            onClick={() => handleVote('dislike')}
            disabled={voting}
          >
            ▼ {post.dislikes}
          </button>
          <button
            className={`comments-toggle ${commentsOpen ? 'active' : ''}`}
            onClick={() => setCommentsOpen(o => !o)}
          >
            💬 {totalComments > 0 ? totalComments : ''} comentar
          </button>
        </div>
      </div>

      {commentsOpen && (
        <CommentSection
          postId={post.id}
          previewComments={newComments}
          onNewComment={handleNewComment}
        />
      )}
    </article>
  )
}

// ─── New post modal ─────────────────────────────────────────────────────────
function NewPostModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Post) => void }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useState<HTMLInputElement | null>(null)

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImage(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  function removeImage() {
    setImage(null)
    setPreview(null)
    if (fileRef[0]) fileRef[0].value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)

    let image_url: string | null = null

    if (image) {
      const ext = image.name.split('.').pop()
      const filename = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filename, image, { upsert: false })

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('post-images')
          .getPublicUrl(filename)
        image_url = urlData.publicUrl
      }
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({ content: trimmed, image_url })
      .select()
      .single()
    if (!error && data) { onCreated(data); onClose() }
    setSending(false)
  }

  const canSubmit = text.trim().length > 0 || image !== null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Nuevo post anónimo</h2>
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
              <button type="button" className="image-remove" onClick={removeImage}>✕</button>
            </div>
          )}

          <div className="modal-footer">
            <div className="modal-left">
              <label className="btn-image" title="Adjuntar imagen">
                🖼
                <input
                  ref={el => { fileRef[0] = el }}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleImage}
                />
              </label>
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
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
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
        <h1 className="logo">ChANONpions</h1>
        <p className="tagline">100% anónimo · sin cuentas · sin rastreo</p>
      </header>

      <main className="feed">
        {loading ? (
          <div className="spinner-wrap"><span className="spinner" /></div>
        ) : posts.length === 0 ? (
          <div className="empty-feed">
            <p>Todavía no hay posts.</p>
            <p>¡Sé el primero en publicar algo!</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} onVoteUpdate={handleVoteUpdate} />
          ))
        )}
      </main>

      <button className="fab" onClick={() => setModalOpen(true)} title="Nuevo post">✏️</button>

      {modalOpen && (
        <NewPostModal onClose={() => setModalOpen(false)} onCreated={handleNewPost} />
      )}
    </div>
  )
}
