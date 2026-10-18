/// Small summary statistics.
public enum Tally {
    public enum Failure: Error { case empty }

    /// The sum of values.
    public static func total(_ values: [Double]) -> Double {
        values.reduce(0, +)
    }

    /// The arithmetic mean of values; throws on an empty list.
    public static func mean(_ values: [Double]) throws -> Double {
        guard !values.isEmpty else { throw Failure.empty }
        return total(values) / Double(values.count)
    }
}
