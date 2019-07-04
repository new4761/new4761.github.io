


html`
<template name="test" >
  <h1>This won't display!</h1>
  <script>alert("this won't alert!");</script>
</template>`


let tmpl = document.querySelector('template');
class MyElement extends HTMLElement {
constructor() {
    super(); // always call super() first in the constructor.
    let shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.appendChild(tmpl.content.cloneNode(true));
  }

}
customElements.define('my-element', MyElement);
