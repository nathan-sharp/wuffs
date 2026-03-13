// components.js - Holds the reusable parts of the site

function loadComponents() {
    
    // 1. The Header Banner
    const headerElement = document.getElementById('site-header');
    if (headerElement) {
        headerElement.innerHTML = `
            <marquee scrollamount="6"><h1>🐾 Welcome to NathanWuff's Cyber Space! 🐾</h1></marquee>
        `;
    }

    // 2. The Navigation Sidebar
    const sidebarElement = document.getElementById('site-sidebar');
    if (sidebarElement) {
        sidebarElement.innerHTML = `
            <a href="/">
                <img src="/media/pfp.jpg" alt="My Avatar" width="150" class="avatar" border="0">
            </a>
            <br><br>
            
            <a href="/"><b>@wuffs.xyz</b></a>
            <br><br>
            
            <hr>
            <h3>Navigation</h3>
            <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about/">About Me</a></li>
                <li><a href="/ref/">Ref Sheet</a></li>
                <li><a href="/f@h/">Folding Furries</a></li>
            </ul>
        `;
    }

    // 3. The Footer
    const footerElement = document.getElementById('site-footer');
    if (footerElement) {
        footerElement.innerHTML = `
            <p><i>Site best viewed with, your eyes.</i></p>
            
            <a href="https://www.w3.org/Style/CSS/Buttons" target="_blank">
                <img src="https://www.w3.org/Style/CSS/Buttons/mwcts" alt="Made with CSS" border="0">
            </a>
            <a href="https://getfirefox.com/" target="_blank">
                <img src="/buttons/firefoxget.gif" alt="Get Firefox" border="0">
            </a>

            <iframe src="//incr.easrng.net/badge?key=NathanWuff" style="background: url(//incr.easrng.net/bg.gif)" title="increment badge" width="88" height="31" frameborder="0"></iframe>

            <a target="_blank" href="https://keeri.place/">
                <img src="https://keeri.place/images/button-2024.gif" border="0">
            </a>
            <a target="_blank" href="https://robophobia.org/">
                <img src="https://robophobia.org/buttons/robophobia_button.gif" border="0">
            </a>
        `;
    }

    // 4. Auto-escape any <code> blocks that contain raw HTML so they display as text
    function autoEscapeCodeBlocks() {
        document.querySelectorAll('code').forEach(codeEl => {
            const html = codeEl.innerHTML;
            // skip blocks that are already escaped
            if (html.includes('&lt;') || html.includes('&gt;')) return;
            // only operate on code elements that contain element children (i.e. raw HTML)
            const hasElementChildren = Array.from(codeEl.childNodes).some(n => n.nodeType === 1);
            if (!hasElementChildren) return;

            // If not wrapped in a <pre>, wrap it so whitespace is preserved
            if (codeEl.parentElement && codeEl.parentElement.tagName !== 'PRE') {
                const pre = document.createElement('pre');
                const newCode = document.createElement('code');
                newCode.textContent = html; // textContent escapes automatically
                pre.appendChild(newCode);
                codeEl.parentElement.replaceChild(pre, codeEl);
            } else {
                codeEl.textContent = html;
            }
        });
    }

    // run auto-escape for any code snippets on the page
    autoEscapeCodeBlocks();
}

// Run the script when the page loads
window.onload = loadComponents;