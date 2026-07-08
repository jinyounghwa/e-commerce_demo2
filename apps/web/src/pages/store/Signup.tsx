import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../api';
import { useAuth } from '../../stores/auth';
import { ErrorMsg } from '../../components/ui';

export default function Signup() {
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [err, setErr] = useState('');
  const { setAuth } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const { token, user } = await authApi.signup(form);
      setAuth(token, user); qc.clear(); nav('/');
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-bold mb-6 text-center">회원가입</h1>
      <ErrorMsg msg={err} />
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder="비밀번호 (6자 이상)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn-primary w-full">가입하기 (가입축하 쿠폰 자동 발급)</button>
      </form>
      <p className="text-center text-sm mt-4 text-gray-500"><Link to="/login">로그인으로</Link></p>
    </div>
  );
}
