import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SegmentedButtons, Text, Card, Icon, TextInput, Portal, Dialog } from "react-native-paper";
import { fetchPayments, verifyPayment, markPaymentMismatch, fetchShops, Payment } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function PaymentVerification() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [filter, setFilter] = useState("pending");
  const [note, setNote] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"verify" | "mismatch" | null>(null);

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) {
      setShopId(shopsQuery.data[0].id);
    }
  }, [shopId, shopsQuery.data]);

  const paymentsQuery = useQuery({
    queryKey: ["payments", shopId],
    queryFn: () => fetchPayments(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!activePaymentId || !actionType) return Promise.reject();
      if (actionType === "verify") {
        return verifyPayment(token ?? "", activePaymentId, note);
      } else {
        return markPaymentMismatch(token ?? "", activePaymentId, note);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", shopId] });
      setActivePaymentId(null);
      setActionType(null);
      setNote("");
    },
  });

  // Filter payments locally
  const filteredPayments = paymentsQuery.data?.filter((payment) => {
    // Only verify non-cash payments
    if (payment.paymentMode === "CASH") return false;

    if (filter === "pending") {
      return payment.verificationStatus === "RECORDED" || payment.verificationStatus === "PENDING_VERIFICATION";
    } else {
      return payment.verificationStatus === "VERIFIED" || payment.verificationStatus === "MISMATCH";
    }
  }) ?? [];

  const handleAction = (paymentId: string, type: "verify" | "mismatch") => {
    setActivePaymentId(paymentId);
    setActionType(type);
  };

  const getTone = (status: string) => {
    if (status === "VERIFIED") return "green";
    if (status === "MISMATCH") return "red";
    if (status === "PENDING_VERIFICATION" || status === "RECORDED") return "amber";
    return "blue";
  };

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Verify Payments"
        subtitle="Approve UPI, card, and bank transactions."
      />

      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <SegmentedButtons
        value={filter}
        onValueChange={setFilter}
        buttons={[
          { value: "pending", label: "Pending Check" },
          { value: "reviewed", label: "Verified & Mismatches" },
        ]}
        style={{ marginVertical: 8 }}
        theme={{ colors: { primary: "#246b4b" } }}
      />

      <ScrollView className="flex-1 mt-2">
        <Section title={`${filter === "pending" ? "Pending" : "Reviewed"} Transactions (${filteredPayments.length})`}>
          {paymentsQuery.isLoading ? (
            <Text style={{ color: "#667064", textAlign: "center", marginVertical: 20 }}>Loading payments...</Text>
          ) : null}

          {!paymentsQuery.isLoading && filteredPayments.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-[#b9c3b5] bg-white p-8 items-center justify-center">
              <Text variant="titleMedium" style={{ fontWeight: "700", color: "#17211b" }}>All Clear</Text>
              <Text variant="bodySmall" style={{ color: "#667064", marginTop: 4, textAlign: "center" }}>
                No payments fit this category for the selected shop.
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {filteredPayments.map((payment) => (
              <Card
                key={payment.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#e5eadd",
                  elevation: 2,
                }}
              >
                <Card.Content style={{ gap: 12 }}>
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                        <Icon
                          source={payment.paymentMode === "CHEQUE" ? "bank-transfer" : "cellphone-nfc"}
                          size={18}
                          color="#246b4b"
                        />
                      </View>
                      <Text variant="titleMedium" style={{ fontWeight: "800", color: "#17211b" }}>
                        {payment.paymentMode} • ₹{payment.amount}
                      </Text>
                    </View>
                    <StatusPill label={payment.verificationStatus} tone={getTone(payment.verificationStatus)} />
                  </View>

                  <View className="gap-1.5 border-t border-[#f4f6f1] pt-3">
                    <Text variant="bodySmall" style={{ color: "#667064" }}>
                      Collected by: <Text style={{ color: "#17211b", fontWeight: "600" }}>{payment.receivedBy?.name}</Text>
                    </Text>
                    {payment.referenceNumber ? (
                      <Text variant="bodySmall" style={{ color: "#667064" }}>
                        Ref / UTR: <Text style={{ color: "#17211b", fontWeight: "600" }}>{payment.referenceNumber}</Text>
                      </Text>
                    ) : null}
                    {payment.sale ? (
                      <Text variant="bodySmall" style={{ color: "#667064" }}>
                        Linked Bill: <Text style={{ color: "#17211b", fontWeight: "600" }}>{payment.sale.saleNumber}</Text>
                      </Text>
                    ) : null}
                    <Text variant="bodySmall" style={{ color: "#667064" }}>
                      Date: {new Date(payment.receivedAt).toLocaleString()}
                    </Text>
                  </View>

                  {filter === "pending" && (
                    <View className="flex-row gap-3 border-t border-[#f4f6f1] pt-3">
                      <Button
                        mode="outlined"
                        textColor="#b42318"
                        style={{ flex: 1, borderRadius: 10, borderColor: "#ffe1dc" }}
                        contentStyle={{ height: 40 }}
                        onPress={() => handleAction(payment.id, "mismatch")}
                      >
                        Mismatch
                      </Button>
                      <Button
                        mode="contained"
                        buttonColor="#246b4b"
                        style={{ flex: 1, borderRadius: 10 }}
                        contentStyle={{ height: 40 }}
                        onPress={() => handleAction(payment.id, "verify")}
                      >
                        Verify
                      </Button>
                    </View>
                  )}
                </Card.Content>
              </Card>
            ))}
          </View>
        </Section>
      </ScrollView>

      <Portal>
        <Dialog
          visible={activePaymentId !== null}
          onDismiss={() => {
            setActivePaymentId(null);
            setActionType(null);
            setNote("");
          }}
          style={{ backgroundColor: "white", borderRadius: 20 }}
        >
          <Dialog.Title style={{ fontWeight: "800", color: "#17211b" }}>
            {actionType === "verify" ? "Verify Payment" : "Report Payment Mismatch"}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: "#667064", marginBottom: 12 }}>
              Add an optional comment or note for verification records.
            </Text>
            <TextInput
              mode="outlined"
              label="Verification Note"
              value={note}
              onChangeText={setNote}
              outlineStyle={{ borderRadius: 12, borderColor: "#d9dfd2" }}
              activeOutlineColor="#246b4b"
              placeholder="e.g. Received in HDFC Account"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setActivePaymentId(null);
                setActionType(null);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={mutation.isPending}
              textColor={actionType === "verify" ? "#246b4b" : "#b42318"}
              onPress={() => mutation.mutate()}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
