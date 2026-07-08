import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../api';
import { useAuth } from '../../stores/auth';
import { ErrorMsg } from '../../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const { setAuth } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const { token, user } = await authApi.login({ email, password });
      setAuth(token, user);
      qc.clear();
      nav(user.role === 'ADMIN' ? '/admin' : '/');
    } catch (e: any) { setErr(e.message); }
  };

  const quick = async (email: string) => {
    setEmail(email); setPassword('demo1234');
    try {
      const { token, user } = await authApi.login({ email, password: 'demo1234' });
      setAuth(token, user); qc.clear(); nav(user.role === 'ADMIN' ? '/admin' : '/');
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-bold mb-6 text-center">로그인</h1>
      <ErrorMsg msg={err} />
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full">로그인</button>
      </form>
      <p className="text-center text-sm mt-4 text-gray-500"><Link to="/signup">회원가입</Link></p>
      <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm">
        <p className="font-medium mb-2 text-gray-600">⚡ 데모 빠른 로그인</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => quick('user1@demo.com')} className="btn-outline btn-sm">사용자1 (VIP)</button>
          <button onClick={() => quick('user6@demo.com')} className="btn-outline btn-sm">사용자6 (BRONZE)</button>
          <button onClick={() => quick('admin@demo.com')} className="btn-outline btn-sm">관리자</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">비밀번호: demo1234</p>
      </div>
    </div>
  );
}
