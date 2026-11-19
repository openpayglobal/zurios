import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Alert,Badge,Button,Card,EmptyState,SelectField,TextField} from "./index.js";

test("Button exposes native disabled and submit semantics",()=>{
 const html=renderToStaticMarkup(createElement(Button,{variant:"danger",type:"submit",disabled:true},"Delete"));
 assert.match(html,/type="submit"/);
 assert.match(html,/disabled=""/);
 assert.match(html,/zui-button--danger/);
});

test("TextField associates label, hint and validation feedback",()=>{
 const html=renderToStaticMarkup(createElement(TextField,{label:"Email address",type:"email",required:true,hint:"Work email only",error:"Email is invalid",value:"bad"}));
 assert.match(html,/<label[^>]*for="[^"]+"/);
 assert.match(html,/aria-invalid="true"/);
 assert.match(html,/aria-describedby="[^"]+-hint [^"]+-error"/);
 assert.match(html,/role="alert"/);
 assert.match(html,/Email address/);
});

test("SelectField renders a labelled native select",()=>{
 const html=renderToStaticMarkup(createElement(SelectField,{label:"Country",value:"UG"},createElement("option",{value:"UG"},"Uganda")));
 assert.match(html,/<label[^>]*for="[^"]+"/);
 assert.match(html,/<select/);
 assert.match(html,/Uganda/);
});

test("Badge renders the requested status variant",()=>{
 const html=renderToStaticMarkup(createElement(Badge,{variant:"success"},"Active"));
 assert.match(html,/zui-badge--success/);
 assert.match(html,/Active/);
});

test("Card preserves semantic section content",()=>{
 const html=renderToStaticMarkup(createElement(Card,null,createElement("h2",null,"Summary")));
 assert.match(html,/<section/);
 assert.match(html,/<h2>Summary<\/h2>/);
});

test("Alert announces critical feedback",()=>{
 const html=renderToStaticMarkup(createElement(Alert,{variant:"danger"},"Action blocked"));
 assert.match(html,/role="alert"/);
 assert.match(html,/Action blocked/);
});

test("EmptyState renders its title and supporting description",()=>{
 const html=renderToStaticMarkup(createElement(EmptyState,{title:"No records",description:"Try another filter."}));
 assert.match(html,/<h3>No records<\/h3>/);
 assert.match(html,/Try another filter/);
});
