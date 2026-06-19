export interface VariableResolverContext {
  conversation: any;
  customerRecord: any;
  phone: string;
}

export interface AutofillVariable {
  key: string;
  label: string;
  resolve: (context: VariableResolverContext) => string;
}

class VariableResolverRegistry {
  private variables: AutofillVariable[] = [];

  constructor() {
    // Register core customer variables
    this.register({
      key: "customer.name",
      label: "Name",
      resolve: (ctx) => ctx.conversation?.contactName || ctx.customerRecord?.name || "",
    });

    this.register({
      key: "customer.phone",
      label: "Phone",
      resolve: (ctx) => ctx.phone || "",
    });

    // outstanding is plugged here but can be updated or modularized later
    this.register({
      key: "customer.outstanding",
      label: "Outstanding",
      resolve: (ctx) => {
        const val = ctx.customerRecord?.outstandingAmount;
        return val ? String(val) : "0.00";
      },
    });
  }

  register(variable: AutofillVariable) {
    if (this.variables.some((v) => v.key === variable.key)) {
      console.warn(`Variable ${variable.key} is already registered. Overwriting.`);
      this.variables = this.variables.filter((v) => v.key !== variable.key);
    }
    this.variables.push(variable);
  }

  getVariables(): AutofillVariable[] {
    return this.variables;
  }

  resolve(key: string, context: VariableResolverContext): string {
    const variable = this.variables.find((v) => v.key === key);
    return variable ? variable.resolve(context) : "";
  }
}

export const variableResolverRegistry = new VariableResolverRegistry();
