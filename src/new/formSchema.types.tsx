import { zodResolver } from "@hookform/resolvers/zod"
import React, { useRef } from "react"
import {
  DeepPartial,
  FormProvider,
  useController as useFormController,
  useForm,
  UseFormProps,
  UseFormReturn
} from "react-hook-form"
import { z } from "zod"

export type Indexes<V extends readonly unknown[]> = {
  [K in Exclude<keyof V, keyof Array<unknown>>]: K
}

type Equal<T, U> = T extends U ? (U extends T ? true : false) : false

export type IndexOf<V extends readonly unknown[], T> = {
  [I in keyof Indexes<V>]: Equal<V[I], T> extends true ? I : never
}[keyof Indexes<V>]

export type ReactProps = any

export type ComponentsMapping<Props extends ReactProps> = readonly (readonly [
  z.ZodFirstPartyTypeKind,
  React.FC<Props>
])[]

export type FormSchemaWithoutComponent<
  Mapping extends ComponentsMapping<any>,
  Validation extends z.ZodFirstPartySchemaTypes
> = {
  validation: Validation
  props?: Mapping[IndexOf<
    Mapping,
    readonly [Validation["_def"]["typeName"], any]
  >] extends readonly [any, any]
    ? Partial<
        Parameters<
          Mapping[IndexOf<
            Mapping,
            readonly [Validation["_def"]["typeName"], any]
          >][1]
        >[0]
      >
    : never
}

export type FormSchemaWithComponent<
  Validation extends z.ZodFirstPartySchemaTypes,
  Component extends React.FC<any>
> = {
  validation: Validation
  component: Component
  props?: Partial<Parameters<Component>[0]>
}

export type FormSchemaInner<
  Mapping extends ComponentsMapping<any>,
  Validation extends z.ZodFirstPartySchemaTypes,
  Component extends React.FC<any> | undefined
> = Component extends React.FC<any>
  ? FormSchemaWithComponent<Validation, Component>
  : FormSchemaWithoutComponent<Mapping, Validation>

export type FormSchema<
  Mapping extends ComponentsMapping<any>,
  Validation extends z.ZodFirstPartySchemaTypes,
  Component extends React.FC<any> | undefined
> = Record<string, FormSchemaInner<Mapping, Validation, Component>>

export type SchemaToZodSchema<Schema extends FormSchema<any, any, any>> =
  z.ZodObject<{
    [Item in keyof Schema]: Schema[Item]["validation"]
  }>

export function schemaToZodSchema<Schema extends FormSchema<any, any, any>>(
  schema: Schema
) {
  return z.object(
    Object.fromEntries(
      Object.keys(schema).map((key) => {
        const field = schema[key]
        if (!field) {
          throw new Error("Field not found!")
        }

        return [key, field.validation]
      })
    )
  ) as SchemaToZodSchema<Schema>
}

export type FormProps<
  Schema extends FormSchema<any, any, any>,
  Values extends z.infer<SchemaToZodSchema<Schema>> = z.infer<
    SchemaToZodSchema<Schema>
  >
> = {
  schema: Schema
  children?: (fields: Record<keyof Schema, JSX.Element>) => React.ReactNode

  /**
   * A callback function that will be called with the data once the form has been submitted and validated successfully.
   */
  onSubmit: (values: Values) => unknown
  /**
   * Use this if you need access to the `react-hook-form` useForm() in the component containing the form component (if you need access to any of its other properties.)
   * This will give you full control over you form state (in case you need check if it's dirty or reset it or anything.)
   * @example
   * ```tsx
   * function Component() {
   *   const form = useForm();
   *   return <MyForm useFormResult={form}/>
   * }
   * ```
   */
  formResult?: UseFormReturn<Values>

  formProps?: React.FormHTMLAttributes<HTMLFormElement>

  formParams?: Omit<UseFormProps<Values>, "resolver">
}

export function createBuilder<Mapping extends ComponentsMapping<any>>(
  mapping?: Mapping
) {
  return function FormComponent<
    Validation extends z.ZodFirstPartySchemaTypes,
    Component extends React.FC<any> | undefined,
    Schema extends FormSchema<Mapping, Validation, Component>
  >(props: FormProps<Schema>) {
    const { schema, children, formResult, formProps, formParams, onSubmit } =
      props

    const useFormResultInitialValue = useRef(formResult)
    if (!!useFormResultInitialValue.current !== !!formResult) {
      throw new Error(useFormResultValueChangedErrorMessage())
    }

    const _schema = schemaToZodSchema(schema)
    const resolver = zodResolver(_schema)
    const _form = (() => {
      if (formResult) return formResult
      const uf = useForm({ ...formParams, resolver })
      return uf
    })()

    const { handleSubmit } = _form

    const submitFn = handleSubmit(onSubmit)

    const renderedFields = (() => {
      return Object.fromEntries(
        Object.keys(schema).map((key) => {
          const field = schema[key]
          if (!field) {
            throw new Error("Field not found!")
          }

          const Component = (() => {
            if ("component" in field) {
              return field.component
            }

            return mapping?.find(
              (item) => item[0] === field.validation._def.typeName
            )?.[1]
          })()

          if (!Component) {
            throw new Error("Component not found!")
          }

          return [key, <Component key={key} name={key} {...field.props} />]
        })
      ) as Record<keyof Schema, JSX.Element>
    })()

    return (
      <FormProvider {..._form}>
        <form {...formProps} onSubmit={submitFn}>
          {children ? children(renderedFields) : Object.values(renderedFields)}
        </form>
      </FormProvider>
    )
  }
}

/**
 * Allows working accessing and updating the form state for a field. Returns everything that a vanilla `react-hook-form` returns
 * `useController` call returns but with additional typesafety. Additionally, returns an `errors` object that provides a typesafe way
 * of dealing with nested react hook form errors.
 * @example
 * const {field: {onChange, value}, errors} = useTsController<string>()
 *
 * return (
 *  <>
 *    <input
 *      value={value}
 *      onChange={(e)=>onChange(e.target.value)}
 *    />
 *    {errors?.errorMessage && <span>{errors.errorMessage}</span>}
 *  </>
 * )
 */
export function useController<FieldType extends any>(name: string) {
  type OnChangeValue = FieldType extends Object
    ? DeepPartial<FieldType> | undefined
    : FieldType | undefined

  const controller = useFormController({ name })
  const {
    fieldState,
    field: { onChange }
  } = controller

  function _onChange(value: OnChangeValue) {
    onChange(value)
  }

  return {
    ...controller,
    field: { ...controller.field, onChange: _onChange },
    error: fieldState.error?.message?.length ? fieldState.error : undefined
  }
}

export function useFormResultValueChangedErrorMessage() {
  return `useFormResult prop changed - its value shouldn't changed during the lifetime of the component.`
}
