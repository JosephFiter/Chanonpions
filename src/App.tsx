import { useState, useEffect, useCallback } from 'react'
import { supabase, type Post, type Comment } from './supabase'
import './App.css'

// localStorage helpers for votes
function getVotes(): Record<string, 'like' | 'dislike'> {
  try {
    return JSON.parse(localStorage.getItem('chanonpions_votes') || '{}')
  } catch {
    return {}
  }
}

function saveVote(postId: string, vote: 'like' | 'dislike' | null) {
  const votes = getVotes()
  if (vote === null) {
    delete votes[postId]
  } else {
    votes[postId] = vote
  }
  localStorage.setItem('chanonpions_votes', JSON.stringify(votes))
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Comment section ───────────────────────────────────────────────────────
function CommentSection({ post }: { post: Post }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase
      .from('comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setComments(data ?? [])
        setLoading(false)
      })
  }, [post.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: post.id, content: trimmed })
      .select()
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      setText('')
    }
    setSending(false)
  }

  return (
    <div className="comments-section">
      {loading ? (
        <p className="comments-empty">Cargando...</p>
      ) : comments.length === 0 ? (
        <p className="comments-empty">Sin comentarios aún.</p>
      ) : (
        <ul className="comments-list">
          {comments.map(c => (
            <li key={c.id} className="comment">
              <span className="comment-content">{c.content}</span>
              <span className="comment-time">{timeAgo(c.created_at)}</span>
            </li>
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
function PostCard({ post, onVoteUpdate }: { post: Post; onVoteUpdate: (id: string, likes: number, dislikes: number) => void }) {
  const votes = getVotes()
  const myVote = votes[post.id] ?? null
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [voting, setVoting] = useState(false)

  async function handleVote(type: 'like' | 'dislike') {
    if (voting) return
    setVoting(true)

    const isSame = myVote === type

    // Undo previous vote if any
    if (myVote === 'like') await supabase.rpc('decrement_likes', { post_id: post.id })
    if (myVote === 'dislike') await supabase.rpc('decrement_dislikes', { post_id: post.id })

    if (!isSame) {
      // Apply new vote
      if (type === 'like') await supabase.rpc('increment_likes', { post_id: post.id })
      if (type === 'dislike') await supabase.rpc('increment_dislikes', { post_id: post.id })
      saveVote(post.id, type)
    } else {
      saveVote(post.id, null)
    }

    // Recalculate counts locally
    let newLikes = post.likes
    let newDislikes = post.dislikes

    if (myVote === 'like') newLikes = Math.max(0, newLikes - 1)
    if (myVote === 'dislike') newDislikes = Math.max(0, newDislikes - 1)

    if (!isSame) {
      if (type === 'like') newLikes += 1
      if (type === 'dislike') newDislikes += 1
    }

    onVoteUpdate(post.id, newLikes, newDislikes)
    setVoting(false)
  }

  const currentVote = getVotes()[post.id] ?? null

  return (
    <article className="post-card">
      <p className="post-content">{post.content}</p>
      <div className="post-footer">
        <span className="post-time">{timeAgo(post.created_at)}</span>
        <div className="post-actions">
          <button
            className={`vote-btn like-btn ${currentVote === 'like' ? 'active' : ''}`}
            onClick={() => handleVote('like')}
            disabled={voting}
            title="Me gusta"
          >
            ▲ {post.likes}
          </button>
          <button
            className={`vote-btn dislike-btn ${currentVote === 'dislike' ? 'active' : ''}`}
            onClick={() => handleVote('dislike')}
            disabled={voting}
            title="No me gusta"
          >
            ▼ {post.dislikes}
          </button>
          <button
            className={`comments-toggle ${commentsOpen ? 'active' : ''}`}
            onClick={() => setCommentsOpen(o => !o)}
          >
            💬 comentar
          </button>
        </div>
      </div>
      {commentsOpen && <CommentSection post={post} />}
    </article>
  )
}

// ─── New post modal ─────────────────────────────────────────────────────────
function NewPostModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Post) => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('posts')
      .insert({ content: trimmed })
      .select()
      .single()
    if (!error && data) {
      onCreated(data)
      onClose()
    }
    setSending(false)
  }

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
            rows={5}
          />
          <div className="modal-footer">
            <span className="char-count">{text.length}/500</span>
            <div className="modal-btns">
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-post" disabled={!text.trim() || sending}>
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

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

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

      <button className="fab" onClick={() => setModalOpen(true)} title="Nuevo post">
        ✏️
      </button>

      {modalOpen && (
        <NewPostModal onClose={() => setModalOpen(false)} onCreated={handleNewPost} />
      )}
    </div>
  )
}
