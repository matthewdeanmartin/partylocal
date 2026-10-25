import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

const KEY = 'party-clubhouse:view';

/** Desktop pages and their phone counterparts (and back). */
const TO_PHONE: [RegExp, string][] = [
  [/^\/people\/(\d+)$/, '/m/people/$1'],
  [/^\/e\/(\d+)/, '/m/e/$1'],
  [/^\/groups\/(?!new)([^/?]+)/, '/m/groups/$1'],
  [/^\/groups/, '/m/groups'],
  [/^\/plans/, '/m/plans'],
  [/^\/notices/, '/m/inbox'],
  [/^\/profile/, '/m/me'],
  [/^\/new/, '/m/new'],
  [/^\/signin/, '/m/signin'],
];
const TO_DESK: [RegExp, string][] = [
  [/^\/m\/people\/(\d+)$/, '/people/$1'],
  [/^\/m\/e\/(\d+)/, '/e/$1'],
  [/^\/m\/groups\/(?!new)([^/?]+)/, '/groups/$1'],
  [/^\/m\/groups/, '/groups'],
  [/^\/m\/plans/, '/plans'],
  [/^\/m\/inbox/, '/notices'],
  [/^\/m\/me/, '/profile'],
  [/^\/m\/new/, '/new'],
  [/^\/m\/signin/, '/signin'],
];

function map(url: string, table: [RegExp, string][], fallback: string): string {
  for (const [re, to] of table) if (re.test(url)) return url.replace(re, to);
  return fallback;
}

/**
 * Desktop (the forms, under /) or phone (the card deck, under /m). Phones
 * start on the deck; a choice made with the switch is remembered.
 */
@Injectable({ providedIn: 'root' })
export class View {
  private readonly router = inject(Router);

  /** The view to open with, before anything is shown. */
  initial(): 'desk' | 'phone' {
    const chosen = read();
    if (chosen === 'desk' || chosen === 'phone') return chosen;
    return matchMedia('(max-width: 700px), (pointer: coarse) and (max-width: 900px)').matches ? 'phone' : 'desk';
  }

  /** On first load: a phone opening a desktop link lands on the deck (and vice versa). */
  settle(url: string): string | null {
    const phone = /^\/m(?:\/|$)/.test(url);
    const want = this.initial();
    if (want === 'phone' && !phone) {
      if (/^\/groups\/[^/]+\//.test(url)) return null;
      return map(url, TO_PHONE, url === '/' ? '/m' : url);
    }
    if (want === 'desk' && phone && read() === 'desk') return map(url, TO_DESK, '/');
    return null;
  }

  toPhone(): void {
    write('phone');
    void this.router.navigateByUrl(map(this.router.url, TO_PHONE, '/m'));
  }

  toDesk(): void {
    write('desk');
    void this.router.navigateByUrl(map(this.router.url, TO_DESK, '/'));
  }
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

function write(v: string): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // Not remembered; the switch still works for this visit.
  }
}
