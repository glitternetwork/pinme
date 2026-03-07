import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import { API, getApiUrl } from '../../utils/api';

interface Message {
  id: number;
  content: string;
  created_at: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMessages();
  }, []);

  async function fetchMessages() {
    try {
      const res = await fetch(getApiUrl('/api/hello'));
      const data = await res.json();
      setMessages(data.data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });
      if (res.ok) {
        setInput('');
        fetchMessages();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <Header />

      <main>
        <section className="api-info">
          <code>API: {API}</code>
        </section>

        <form onSubmit={handleSubmit} className="message-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? '发送中...' : '发送'}
          </button>
        </form>

        <section className="messages">
          <h2>消息列表</h2>
          {messages.length === 0 ? (
            <p className="empty">暂无消息</p>
          ) : (
            <ul>
              {messages.map((msg) => (
                <li key={msg.id}>
                  <span className="content">{msg.content}</span>
                  <span className="time">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
