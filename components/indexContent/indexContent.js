
  

import { LitElement, html } from 'lit-element';

// Extend the LitElement base class
class mainElement extends LitElement {
    createRenderRoot() {
        return this;
      }

    render() {
        return html`
  <div class="main-content">


<div class="main-content-inner"></div>

    <div class="page-content">
        <div class="ace-settings-container" id="ace-settings-container">

        </div><!-- /.ace-settings-container -->

        <div class="page-header">
            <h1>
                Dashboard
                <!-- <small>
                        <i class="ace-icon fa fa-angle-double-right"></i>
                        overview &amp; stats
                    </small> -->
            </h1>
        </div><!-- /.page-header -->

        <div class="row">
            <div class="col-xs-12">


                <div class="hr hr32 hr-dotted"></div>



                <div class="hr hr32 hr-dotted"></div>

                <div class="row">



                </div><!-- /.row -->

                <!-- PAGE CONTENT ENDS -->
            </div><!-- /.col -->
        </div><!-- /.row -->
    </div><!-- /.page-content -->
</div>
</div>
    `;
    }
}
// Register the new element with the browser.
customElements.define('index-element', mainElement);
