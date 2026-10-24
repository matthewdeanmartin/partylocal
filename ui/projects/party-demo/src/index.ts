// party-demo: the board in a browser, for trying party without one. Only
// the switch is exported: live builds get the no-op `switch.ts`, and the
// `demo` configurations replace it with `switch.demo.ts` (angular.json), so
// the fake board never ships in firmware.
export { DEMO, startDemo } from './switch';
