
import { LitElement, html } from 'lit-element';

// Extend the LitElement base class
class footerElement extends LitElement {
    createRenderRoot() {
        return this;
      }

    render() {
        return html`
    <!-- template content -->
    <div class="footer">
        <div class="footer-inner">
            <div class="footer-content">
                <span class="bigger-120">
                    <span class="blue bolder">NMK</span>
                    Dev team &copy; 2019
    
                    &nbsp; &nbsp;
                </span>
            </div>
        </div>
    </div>
    `;
    }
}
// Register the new element with the browser.
customElements.define('footer-element', footerElement);
