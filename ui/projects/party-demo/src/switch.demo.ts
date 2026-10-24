// Demo build (fileReplacements in angular.json): the board lives in this browser.
import { installDemo } from './install';

export const DEMO = true;

export function startDemo(): void {
  installDemo();
}
