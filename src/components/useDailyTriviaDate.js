import { useEffect, useState } from 'react';
import { getSchoolDate, vacationDeadlineMillis } from './vacationChallengeUtils.js';

export default function useDailyTriviaDate() {
  const [date, setDate] = useState(() => getSchoolDate());
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now(), today = getSchoolDate(now);
      setDate(today);
      timer = setTimeout(refresh, Math.max(50, vacationDeadlineMillis(today) - now + 30));
    };
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return date;
}
