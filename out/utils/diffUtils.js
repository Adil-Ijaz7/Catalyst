"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUnifiedDiff = buildUnifiedDiff;
const diff_1 = require("diff");
function buildUnifiedDiff(relativePath, previousContent, nextContent, type) {
    const oldLabel = type === 'create' ? '/dev/null' : `a/${relativePath}`;
    const newLabel = type === 'delete' ? '/dev/null' : `b/${relativePath}`;
    return (0, diff_1.createPatch)(relativePath, previousContent, nextContent, oldLabel, newLabel);
}
//# sourceMappingURL=diffUtils.js.map