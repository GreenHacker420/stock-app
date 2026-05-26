import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SegmentedButtons, Text, Card, Icon } from "react-native-paper";
import { fetchCashSessions, reviewCashSession, fetchShops, DetailedCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function CashClosingReview() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [filter, setFilter] = useState("pending");

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

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions", shopId],
    queryFn: () => fetchCashSessions(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const reviewMutation = useMutation({
    mutationFn: (sessionId: string) => reviewCashSession(token ?? "", sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions", shopId] });
      queryClient.invalidateQueries({ queryKey: ["shops"] });
    },
  });

  const filteredSessions = sessionsQuery.data?.filter((session) => {
    if (filter === "pending") {
      return session.status === "CLOSED";
    } else {
      return session.status === "REVIEWED" || session.status === "LOCKED";
    }
  }) ?? [];

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Cash Closing"
        subtitle="Review and approve day-end cash handovers."
      />

      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <SegmentedButtons
        value={filter}
        onValueChange={setFilter}
        buttons={[
          { value: "pending", label: "Needs Review" },
          { value: "reviewed", label: "Reviewed / Locked" },
        ]}
        style={{ marginVertical: 8 }}
        theme={{ colors: { primary: "#246b4b" } }}
      />

      <ScrollView className="flex-1 mt-2">
        <Section title={`Day closing records (${filteredSessions.length})`}>
          {sessionsQuery.isLoading ? (
            <Text style={{ color: "#667064", textAlign: "center", marginVertical: 20 }}>Loading sessions...</Text>
          ) : null}

          {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-[#b9c3b5] bg-white p-8 items-center justify-center">
              <Text variant="titleMedium" style={{ fontWeight: "700", color: "#17211b" }}>All Reviewed</Text>
              <Text variant="bodySmall" style={{ color: "#667064", marginTop: 4, textAlign: "center" }}>
                No cash closures require review at this time.
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {filteredSessions.map((session) => {
              const diff = Number(session.difference || 0);
              const isMismatched = diff !== 0;

              return (
                <Card
                  key={session.id}
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
                        <Icon source="cash-register" size={20} color="#246b4b" />
                        <Text variant="titleMedium" style={{ fontWeight: "800", color: "#17211b" }}>
                          Session by {session.staff?.name}
                        </Text>
                      </View>
                      <StatusPill label={session.status} tone={session.status === "REVIEWED" ? "green" : "amber"} />
                    </View>

                    <View className="flex-row gap-3 border-t border-[#f4f6f1] pt-3">
                      <View className="flex-1 bg-[#f6f7f2] p-3 rounded-xl">
                        <Text style={{ fontSize: 10, color: "#667064", fontWeight: "600" }}>Expected Cash</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: "#17211b", marginTop: 2 }}>
                          ₹{session.expectedCash}
                        </Text>
                      </View>
                      <View className="flex-1 bg-[#f6f7f2] p-3 rounded-xl">
                        <Text style={{ fontSize: 10, color: "#667064", fontWeight: "600" }}>Actual Cash</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: "#17211b", marginTop: 2 }}>
                          ₹{session.actualCash || "0"}
                        </Text>
                      </View>
                    </View>

                    <View className="gap-2 bg-[#f4f6f1]/50 p-3 rounded-xl border border-[#eef2ea]">
                      <View className="flex-row justify-between">
                        <Text style={{ fontSize: 11, color: "#667064" }}>Handover Amount:</Text>
                        <Text style={{ fontSize: 11, color: "#17211b", fontWeight: "700" }}>₹{session.cashHandover || "0"}</Text>
                      </View>

                      {Number(session.otherDeductionsAmount || 0) > 0 ? (
                        <View className="gap-0.5 border-t border-[#e5eadd]/50 pt-1.5 mt-0.5">
                          <View className="flex-row justify-between">
                            <Text style={{ fontSize: 11, color: "#667064" }}>Other Deductions / Expenses:</Text>
                            <Text style={{ fontSize: 11, color: "#b42318", fontWeight: "700" }}>-₹{session.otherDeductionsAmount}</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: "#8a9488", fontStyle: "italic" }}>
                            Reason: {session.otherDeductionsReason}
                          </Text>
                        </View>
                      ) : null}

                      {isMismatched ? (
                        <View className="gap-0.5 border-t border-red-100 pt-1.5 mt-0.5">
                          <View className="flex-row justify-between">
                            <Text style={{ fontSize: 11, color: "#b42318", fontWeight: "700" }}>Difference Mismatch:</Text>
                            <Text style={{ fontSize: 11, color: "#b42318", fontWeight: "800" }}>
                              {diff > 0 ? "+" : ""}₹{diff}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: "#b42318", fontStyle: "italic", fontWeight: "500" }}>
                            Explanation: {session.differenceReason || "No explanation provided"}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row justify-between border-t border-green-100 pt-1.5 mt-0.5">
                          <Text style={{ fontSize: 11, color: "#246b4b", fontWeight: "700" }}>Reconciliation:</Text>
                          <Text style={{ fontSize: 11, color: "#246b4b", fontWeight: "800" }}>Matched</Text>
                        </View>
                      )}
                    </View>

                    <View className="gap-1 border-t border-[#f4f6f1] pt-3">
                      <Text style={{ fontSize: 10, color: "#8a9488" }}>
                        Opened: {new Date(session.openedAt).toLocaleString()}
                      </Text>
                      {session.closedAt ? (
                        <Text style={{ fontSize: 10, color: "#8a9488" }}>
                          Closed: {new Date(session.closedAt).toLocaleString()}
                        </Text>
                      ) : null}
                    </View>

                    {session.status === "CLOSED" && (
                      <Button
                        mode="contained"
                        buttonColor="#246b4b"
                        loading={reviewMutation.isPending && reviewMutation.variables === session.id}
                        disabled={reviewMutation.isPending}
                        style={{ borderRadius: 12, marginTop: 4 }}
                        contentStyle={{ height: 44 }}
                        onPress={() => reviewMutation.mutate(session.id)}
                      >
                        Approve & Mark Reviewed
                      </Button>
                    )}
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}
