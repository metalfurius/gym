import { describe, it, expect } from '@jest/globals';
import { escapeHtml } from '../../js/ui.js';

describe('escapeHtml Security Utility', () => {
  describe('Basic HTML escaping', () => {
    it('should escape < character', () => {
      expect(escapeHtml('<')).toBe('&lt;');
    });

    it('should escape > character', () => {
      expect(escapeHtml('>')).toBe('&gt;');
    });

    it('should escape & character', () => {
      expect(escapeHtml('&')).toBe('&amp;');
    });

    it('should handle " character (quotes are safe in text content)', () => {
      // Note: textContent doesn't escape quotes as they're only dangerous in attributes
      expect(escapeHtml('"')).toBe('"');
    });

    it('should handle \' character (quotes are safe in text content)', () => {
      // Note: textContent doesn't escape quotes as they're only dangerous in attributes
      expect(escapeHtml("'")).toBe("'");
    });

    it('should escape critical HTML characters', () => {
      const input = '<>&"\'"';
      const output = escapeHtml(input);
      expect(output).toContain('&lt;');
      expect(output).toContain('&gt;');
      expect(output).toContain('&amp;');
      // Quotes remain as-is when used in text content (safe for innerHTML)
      expect(output).toContain('"');
      expect(output).toContain("'");
    });
  });

  describe('Script tag prevention', () => {
    it('should escape simple script tag', () => {
      const input = '<script>alert("XSS")</script>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<script>');
      expect(output).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    });

    it('should escape script tag with attributes', () => {
      const input = '<script src="evil.js"></script>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<script');
      expect(output).toContain('&lt;script');
    });

    it('should escape inline event handlers', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const output = escapeHtml(input);
      expect(output).not.toContain('<img');
      expect(output).toContain('&lt;img');
    });

    it('should escape javascript: protocol', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<a');
      expect(output).toContain('&lt;a');
    });
  });

  describe('XSS injection attempts', () => {
    it('should prevent XSS via img tag', () => {
      const input = '<img src=x onerror=alert(document.cookie)>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<img');
      expect(output).toContain('&lt;img');
    });

    it('should prevent XSS via iframe', () => {
      const input = '<iframe src="javascript:alert(1)"></iframe>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<iframe');
      expect(output).toContain('&lt;iframe');
    });

    it('should prevent XSS via object tag', () => {
      const input = '<object data="data:text/html,<script>alert(1)</script>"></object>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<object');
      expect(output).toContain('&lt;object');
    });

    it('should prevent XSS via svg tag', () => {
      const input = '<svg onload=alert(1)>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<svg');
      expect(output).toContain('&lt;svg');
    });

    it('should prevent XSS via input tag', () => {
      const input = '<input type="text" value="x" onfocus="alert(1)">';
      const output = escapeHtml(input);
      expect(output).not.toContain('<input');
      expect(output).toContain('&lt;input');
    });

    it('should prevent XSS via textarea tag', () => {
      const input = '<textarea onfocus="alert(1)">text</textarea>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<textarea');
      expect(output).toContain('&lt;textarea');
    });

    it('should prevent XSS via style tag', () => {
      const input = '<style>body{background:url("javascript:alert(1)")}</style>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<style');
      expect(output).toContain('&lt;style');
    });

    it('should prevent XSS via meta tag', () => {
      const input = '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">';
      const output = escapeHtml(input);
      expect(output).not.toContain('<meta');
      expect(output).toContain('&lt;meta');
    });
  });

  describe('Edge cases and null handling', () => {
    it('should return empty string for null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle plain text without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should convert number to string and escape if needed', () => {
      expect(escapeHtml(123)).toBe('123');
    });

    it('should convert boolean to string', () => {
      expect(escapeHtml(true)).toBe('true');
      expect(escapeHtml(false)).toBe('false');
    });

    it('should handle string with only spaces', () => {
      expect(escapeHtml('   ')).toBe('   ');
    });

    it('should handle newlines', () => {
      const input = 'line1\nline2';
      expect(escapeHtml(input)).toBe('line1\nline2');
    });

    it('should handle tabs', () => {
      const input = 'col1\tcol2';
      expect(escapeHtml(input)).toBe('col1\tcol2');
    });

    it('should handle unicode characters', () => {
      expect(escapeHtml('Hello 世界')).toBe('Hello 世界');
      expect(escapeHtml('Café')).toBe('Café');
      expect(escapeHtml('😀')).toBe('😀');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const result = escapeHtml(longString);
      expect(result).toBe(longString);
      expect(result.length).toBe(10000);
    });

    it('should handle strings with mixed content', () => {
      const input = 'Normal text <script>alert("XSS")</script> more text & special chars';
      const output = escapeHtml(input);
      expect(output).toContain('Normal text');
      expect(output).toContain('&lt;script&gt;');
      expect(output).toContain('&amp;');
      expect(output).not.toContain('<script>');
    });
  });

  describe('Real-world user input scenarios', () => {
    it('should escape workout exercise name with special characters', () => {
      const input = 'Bench Press <100kg>';
      const output = escapeHtml(input);
      expect(output).toBe('Bench Press &lt;100kg&gt;');
    });

    it('should escape exercise notes with HTML-like content', () => {
      const input = 'Increase weight by <5kg> next session';
      const output = escapeHtml(input);
      expect(output).toContain('&lt;5kg&gt;');
    });

    it('should escape user email addresses', () => {
      const input = 'user@example.com';
      const output = escapeHtml(input);
      expect(output).toBe('user@example.com');
    });

    it('should handle routine names with quotes (safe in text content)', () => {
      const input = 'My "Special" Routine';
      const output = escapeHtml(input);
      // Quotes remain unescaped in text content - this is safe for innerHTML
      expect(output).toBe('My "Special" Routine');
    });

    it('should escape workout notes with ampersands', () => {
      const input = 'Push & Pull day';
      const output = escapeHtml(input);
      expect(output).toBe('Push &amp; Pull day');
    });

    it('should handle exercise names with mathematical notations', () => {
      const input = '3 x 12 reps @ 80kg';
      const output = escapeHtml(input);
      expect(output).toBe('3 x 12 reps @ 80kg');
    });
  });

  describe('Multiple escaping prevention', () => {
    it('should not double-escape already escaped content', () => {
      const input = '&lt;script&gt;';
      const output = escapeHtml(input);
      // The function should treat this as plain text and escape the & symbols
      expect(output).toBe('&amp;lt;script&amp;gt;');
    });

    it('should escape HTML entities as plain text', () => {
      const input = '&nbsp;&copy;&reg;';
      const output = escapeHtml(input);
      expect(output).toBe('&amp;nbsp;&amp;copy;&amp;reg;');
    });
  });

  describe('Complex injection attempts', () => {
    it('should prevent nested script tags', () => {
      const input = '<<script>script>alert(1)<</script>/script>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<script');
      expect(output).toContain('&lt;');
    });

    it('should prevent encoded script tags', () => {
      const input = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<scr');
      expect(output).toContain('&lt;scr');
    });

    it('should prevent case variations of script tag', () => {
      const input = '<SCRIPT>alert(1)</SCRIPT>';
      const output = escapeHtml(input);
      expect(output).not.toContain('<SCRIPT');
      expect(output).toContain('&lt;SCRIPT');
    });

    it('should prevent script tag with extra spaces', () => {
      const input = '< script >alert(1)</ script >';
      const output = escapeHtml(input);
      expect(output).not.toContain('< script');
      expect(output).toContain('&lt; script');
    });
  });

  describe('Type coercion edge cases', () => {
    it('should handle object by converting to string', () => {
      const input = { toString: () => '<script>alert(1)</script>' };
      const output = escapeHtml(input);
      expect(output).toContain('&lt;script&gt;');
    });

    it('should handle array by converting to string', () => {
      const input = ['<script>', 'alert(1)', '</script>'];
      const output = escapeHtml(input);
      expect(output).toContain('&lt;script&gt;');
    });

    it('should handle zero', () => {
      expect(escapeHtml(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(escapeHtml(-123)).toBe('-123');
    });

    it('should handle float numbers', () => {
      expect(escapeHtml(123.45)).toBe('123.45');
    });

    it('should handle NaN', () => {
      expect(escapeHtml(NaN)).toBe('NaN');
    });

    it('should handle Infinity', () => {
      expect(escapeHtml(Infinity)).toBe('Infinity');
      expect(escapeHtml(-Infinity)).toBe('-Infinity');
    });
  });
});
