
import { LitElement, html } from 'lit-element';

// Extend the LitElement base class
class basicElement extends LitElement {


  render() {
    return html`
      <!-- template content -->
      <script src="assets/js/jquery-2.1.4.min.js"></script>
      
      <!-- <![endif]-->
      
      <!--[if IE]>
                  <script src="assets/js/jquery-1.11.3.min.js"></script>
                  <![endif]-->
      <script type="text/javascript">
        if('ontouchstart' in document.documentElement) document.write("<script src='assets/js/jquery.mobile.custom.min.js'>"+"<"+"/script>");
      </script>
      <script src="assets/js/bootstrap.min.js"></script>
      
      <!-- page specific plugin scripts -->
      
      <!-- ace scripts -->
      <script src="assets/js/ace-elements.min.js"></script>
      <script src="assets/js/ace.min.js"></script>
      
      <!-- inline scripts related to this page -->
      <script src="main.js"></script>
      <script src="assets/js/ace-extra.min.js"></script>
    `;
  }
}
// Register the new element with the browser.
customElements.define('basic-scripts-element', basicElement);
