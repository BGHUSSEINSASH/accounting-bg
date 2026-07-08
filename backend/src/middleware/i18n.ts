import { Request, Response, NextFunction } from 'express';
import { setLanguage } from '../i18n';

export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const acceptLang = req.headers['accept-language'];
  const lang = req.query.lang as string || req.headers['x-lang'] as string || '';

  if (lang === 'ar' || lang === 'en') {
    setLanguage(lang);
  } else if (acceptLang) {
    if (acceptLang.startsWith('ar')) {
      setLanguage('ar');
    } else {
      setLanguage('en');
    }
  } else {
    setLanguage('ar');
  }
  next();
}
