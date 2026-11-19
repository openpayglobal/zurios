import {useId,type ButtonHTMLAttributes,type InputHTMLAttributes,type ReactNode,type SelectHTMLAttributes} from "react";

type ButtonVariant="primary"|"secondary"|"danger"|"ghost";
type ControlSize="sm"|"md"|"lg";

function cx(...values:Array<string|undefined|false>){return values.filter(Boolean).join(" ");}

export type ButtonProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,"size">&{
 variant?:ButtonVariant;
 size?:ControlSize;
};

export function Button({variant="primary",size="md",type="button",className,children,...props}:ButtonProps){
 return <button {...props} type={type} className={cx("zui-button",`zui-button--${variant}`,`zui-button--${size}`,className)}>{children}</button>;
}

type FieldFeedback={label:string;hint?:string;error?:string};
export type TextFieldProps=Omit<InputHTMLAttributes<HTMLInputElement>,"size">&FieldFeedback;

export function TextField({label,hint,error,id,className,required,...props}:TextFieldProps){
 const generatedId=useId(),fieldId=id??generatedId;
 const describedBy=[hint?`${fieldId}-hint`:undefined,error?`${fieldId}-error`:undefined].filter(Boolean).join(" ")||undefined;
 return <div className="zui-field">
  <label className="zui-field__label" htmlFor={fieldId}>{label}{required&&<span className="zui-field__required" aria-hidden="true"> *</span>}</label>
  <input {...props} id={fieldId} required={required} aria-invalid={error?true:undefined} aria-describedby={describedBy} className={cx("zui-input",error&&"zui-input--error",className)}/>
  {hint&&<p className="zui-field__hint" id={`${fieldId}-hint`}>{hint}</p>}
  {error&&<p className="zui-field__error" id={`${fieldId}-error`} role="alert">{error}</p>}
 </div>;
}

export type SelectFieldProps=Omit<SelectHTMLAttributes<HTMLSelectElement>,"size">&FieldFeedback;
export function SelectField({label,hint,error,id,className,required,children,...props}:SelectFieldProps){
 const generatedId=useId(),fieldId=id??generatedId;
 const describedBy=[hint?`${fieldId}-hint`:undefined,error?`${fieldId}-error`:undefined].filter(Boolean).join(" ")||undefined;
 return <div className="zui-field">
  <label className="zui-field__label" htmlFor={fieldId}>{label}{required&&<span className="zui-field__required" aria-hidden="true"> *</span>}</label>
  <select {...props} id={fieldId} required={required} aria-invalid={error?true:undefined} aria-describedby={describedBy} className={cx("zui-select",error&&"zui-input--error",className)}>{children}</select>
  {hint&&<p className="zui-field__hint" id={`${fieldId}-hint`}>{hint}</p>}
  {error&&<p className="zui-field__error" id={`${fieldId}-error`} role="alert">{error}</p>}
 </div>;
}

export type BadgeVariant="neutral"|"success"|"warning"|"danger"|"info";
export function Badge({variant="neutral",children,className}:{variant?:BadgeVariant;children:ReactNode;className?:string}){
 return <span className={cx("zui-badge",`zui-badge--${variant}`,className)}>{children}</span>;
}

export function Card({children,className,...props}:{children:ReactNode;className?:string}&React.HTMLAttributes<HTMLElement>){
 return <section {...props} className={cx("zui-card",className)}>{children}</section>;
}

export function Alert({variant="info",children,className}:{variant?:BadgeVariant;children:ReactNode;className?:string}){
 return <div className={cx("zui-alert",`zui-alert--${variant}`,className)} role={variant==="danger"?"alert":"status"}>{children}</div>;
}

export function EmptyState({title,description,className}:{title:string;description?:string;className?:string}){
 return <div className={cx("zui-empty-state",className)}><h3>{title}</h3>{description&&<p>{description}</p>}</div>;
}
